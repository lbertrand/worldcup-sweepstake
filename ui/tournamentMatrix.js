/**
 * ui/tournamentMatrix.js — Tournament Progress Matrix component
 *
 * Renders two sub-views toggled by a pill tab strip:
 *
 * Group Stage sub-view:
 * - Secondary tab strip for groups A–L
 * - Table: Pos · Flag · Team · P · W · D · L · GF · GA · GD · Pts
 * - Data rendered directly from ApiStandingsGroup[] (no client-side arithmetic)
 * - Top-2 rows per group: green left-border + accent-green tint + ✓ marker
 * - Assigned teams: bold name + coloured dot with participant initials tooltip
 *
 * Knockout Bracket sub-view:
 * - Flexbox bracket tree (shown when any R32 match appears in fixture data)
 * - Match cards: home/away team flag + name vs score or "TBD"
 * - Winners highlighted with gold border
 * - Unplayed matches in muted styling
 */

// ---------------------------------------------------------------------------
// Module-level state — persists tab selection across re-renders
// ---------------------------------------------------------------------------

/** @type {'group' | 'knockout'} */
let activeMainTab = null;

/** @type {string} Currently active group letter, e.g. "A" */
let activeGroupTab = null;

/** @type {string} Currently active knockout round, e.g. "R32" */
let activeKnockoutTab = null;

/** @type {boolean} Whether the 3rd place ranking sub-tab is active */
let isThirdPlaceRankingActive = false;

// ---------------------------------------------------------------------------
// Flag lookup — FIFA team name → ISO 3166-1 alpha-2 country code (lowercase)
// Covers all 48 WC2026 qualified teams.
// (Duplicated from leaderboard.js / matchTicker.js — cross-importing between
//  UI peers is intentionally avoided per project conventions)
// ---------------------------------------------------------------------------
const TEAM_FLAG_MAP = {
  // CONCACAF
  'Mexico':        'mx',
  'United States': 'us',
  'USA':           'us',
  'Canada':        'ca',
  'Panama':        'pa',
  'Costa Rica':    'cr',
  'Honduras':      'hn',
  'Jamaica':       'jm',
  'Haiti':         'ht',
  'Curaçao':       'cw',

  // CONMEBOL
  'Argentina':     'ar',
  'Brazil':        'br',
  'Colombia':      'co',
  'Uruguay':       'uy',
  'Chile':         'cl',
  'Ecuador':       'ec',
  'Peru':          'pe',
  'Venezuela':     've',
  'Paraguay':      'py',
  'Bolivia':       'bo',

  // UEFA
  'England':       'gb-eng',
  'France':        'fr',
  'Spain':         'es',
  'Germany':       'de',
  'Portugal':      'pt',
  'Netherlands':   'nl',
  'Belgium':       'be',
  'Italy':         'it',
  'Croatia':       'hr',
  'Denmark':       'dk',
  'Serbia':        'rs',
  'Switzerland':   'ch',
  'Austria':       'at',
  'Hungary':       'hu',
  'Slovakia':      'sk',
  'Slovenia':      'si',
  'Türkiye':       'tr',
  'Scotland':      'gb-sct',
  'Wales':         'gb-wls',
  'Ukraine':       'ua',
  'Czech Republic':'cz',
  'Czechia':       'cz',
  'Poland':        'pl',
  'Greece':        'gr',
  'Norway':        'no',
  'Sweden':        'se',
  'Romania':       'ro',
  'Albania':       'al',
  'Bosnia-Herzegovina': 'ba',

  // CAF
  'Morocco':       'ma',
  'Senegal':       'sn',
  'Nigeria':       'ng',
  'Egypt':         'eg',
  'Cameroon':      'cm',
  'Ivory Coast':   'ci',
  'Ghana':         'gh',
  'DR Congo':      'cd',
  'Congo DR':      'cd',
  'Tunisia':       'tn',
  'Algeria':       'dz',
  'Zambia':        'zm',
  'Cape Verde':    'cv',
  'Cape Verde Islands': 'cv',
  'Mali':          'ml',
  'South Africa':  'za',

  // AFC
  'Japan':         'jp',
  'South Korea':   'kr',
  'Saudi Arabia':  'sa',
  'Australia':     'au',
  'Iran':          'ir',
  'Qatar':         'qa',
  'Iraq':          'iq',
  'UAE':           'ae',
  'Uzbekistan':    'uz',
  'Jordan':        'jo',

  // OFC
  'New Zealand':   'nz',
};

// ---------------------------------------------------------------------------
// Flag helpers
// ---------------------------------------------------------------------------

/**
 * Convert a 2-letter ISO code to a regional indicator flag emoji.
 * Sub-national codes (gb-eng, gb-sct, gb-wls) are handled via a lookup table.
 *
 * @param {string} isoCode - lowercase 2-letter ISO or sub-national code
 * @returns {string} flag emoji or fallback
 */
function isoToFlagEmoji(isoCode) {
  if (!isoCode || isoCode.includes('-')) {
    const subNationalEmoji = {
      'gb-eng': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      'gb-sct': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
      'gb-wls': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    };
    return subNationalEmoji[isoCode] ?? '🏳';
  }
  const upper = isoCode.toUpperCase();
  return String.fromCodePoint(
    0x1F1E6 + (upper.codePointAt(0) - 65),
    0x1F1E6 + (upper.codePointAt(1) - 65)
  );
}

/**
 * Build an <img> element for the team flag (20×15px for standings), with emoji fallback.
 *
 * @param {string} teamName - FIFA team name
 * @returns {HTMLElement} img or span element
 */
function buildFlagElement(teamName) {
  const isoCode = TEAM_FLAG_MAP[teamName];
  const fallbackEmoji = isoCode ? isoToFlagEmoji(isoCode) : '🏳';

  if (isoCode) {
    const img = document.createElement('img');
    img.src = `https://flagcdn.com/${isoCode}.svg`;
    img.width = 20;
    img.height = 15;
    img.alt = teamName;
    img.loading = 'lazy';
    img.className = 'flag-img';
    img.onerror = () => {
      const span = document.createElement('span');
      span.className = 'flag-emoji';
      span.textContent = fallbackEmoji;
      span.setAttribute('aria-label', teamName);
      img.replaceWith(span);
    };
    return img;
  }

  const span = document.createElement('span');
  span.className = 'flag-emoji';
  span.textContent = fallbackEmoji;
  span.setAttribute('aria-label', teamName);
  return span;
}

// ---------------------------------------------------------------------------
// Participant colour dot
// Assign a stable colour to each participant based on a hash of their name.
// ---------------------------------------------------------------------------

/**
 * Build a full-name participant chip (replaces the old colored dot).
 * @param {string} participantName
 * @returns {HTMLElement}
 */
function buildParticipantChip(participantName) {
  const chip = document.createElement('span');
  chip.className = 'participant-chip participant-chip--matrix';
  chip.textContent = participantName;
  chip.title = `Assigned to ${participantName}`;
  return chip;
}

// ---------------------------------------------------------------------------
// Knockout bracket helpers
// ---------------------------------------------------------------------------

/** Round display order for the bracket */
const BRACKET_ROUNDS = ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'];

/** Human-readable labels for each round */
const ROUND_LABELS = {
  'R32':   'Round of 32',
  'R16':   'Round of 16',
  'QF':    'Quarter-finals',
  'SF':    'Semi-finals',
  '3RD':  '3rd Place',
  'FINAL': 'Final',
};

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);

/**
 * Check if any R32 match is present in either fixtures or schedule maps.
 * @param {Map<string, object>} fixtures
 * @param {Map<string, object>} schedule
 * @returns {boolean}
 */
function hasKnockoutData(fixtures, schedule) {
  for (const result of fixtures.values()) {
    if (result.round === 'R32') return true;
  }
  for (const entry of schedule.values()) {
    if (entry.round === 'R32') return true;
  }
  return false;
}

/**
 * Collect all knockout matches grouped by round, merging fixture results
 * with schedule entries.
 *
 * @param {Map<string, object>} fixtures
 * @param {Map<string, object>} schedule
 * @returns {Map<string, Array<{matchId: string, entry: object|null, result: object|null}>>}
 */
function collectKnockoutRounds(fixtures, schedule) {
  /** @type {Map<string, Array>} */
  const rounds = new Map();
  for (const round of BRACKET_ROUNDS) rounds.set(round, []);

  // Process schedule entries (source of truth for match metadata)
  for (const [matchId, entry] of schedule) {
    if (!entry.round || entry.round === 'GROUP') continue;
    const result = fixtures.get(matchId) ?? null;
    const roundKey = entry.round;
    if (rounds.has(roundKey)) {
      rounds.get(roundKey).push({ matchId, entry, result });
    }
  }

  // Include fixture-only results not in schedule (unknown matchIds)
  for (const [matchId, result] of fixtures) {
    if (!result.round || result.round === 'GROUP') continue;
    if (schedule.has(matchId)) continue; // already covered above
    const roundKey = result.round;
    if (rounds.has(roundKey)) {
      rounds.get(roundKey).push({ matchId, entry: null, result });
    }
  }

  return rounds;
}

/**
 * Build a single bracket match card element.
 *
 * @param {{ matchId: string, entry: object|null, result: object|null }} match
 * @param {Map<string, string>} assignments
 * @returns {HTMLElement}
 */
function buildBracketMatch(match, assignments) {
  const { entry, result } = match;
  const homeTeam = result?.homeTeam ?? entry?.homeTeam ?? null;
  const awayTeam = result?.awayTeam ?? entry?.awayTeam ?? null;
  const status = result?.status ?? 'NS';
  const isFinished = FINISHED_STATUSES.has(status);
  const isLive = status === 'LIVE';
  const isPlayed = isFinished || isLive;

  const card = document.createElement('div');
  card.className = 'bracket-match' + (isPlayed ? '' : ' bracket-match--unplayed');

  // Home team row
  card.appendChild(buildBracketTeamRow({
    teamName: homeTeam,
    score: isPlayed ? (result?.homeScore ?? null) : null,
    shootoutScore: isPlayed ? (result?.homeShootoutScore ?? null) : null,
    isWinner: result?.homeWinner === true,
    isPlayed,
    assignments,
  }));

  // Separator
  const sep = document.createElement('div');
  sep.className = 'bracket-match-sep';
  card.appendChild(sep);

  // Away team row
  card.appendChild(buildBracketTeamRow({
    teamName: awayTeam,
    score: isPlayed ? (result?.awayScore ?? null) : null,
    shootoutScore: isPlayed ? (result?.awayShootoutScore ?? null) : null,
    isWinner: result?.awayWinner === true,
    isPlayed,
    assignments,
  }));

  return card;
}

/**
 * Build a single team row within a bracket match card.
 *
 * @param {{ teamName: string|null, score: number|null, shootoutScore: number|null, isWinner: boolean, isPlayed: boolean, assignments: Map }} opts
 * @returns {HTMLElement}
 */
function buildBracketTeamRow({ teamName, score, shootoutScore, isWinner, isPlayed, assignments }) {
  const row = document.createElement('div');
  const isTbd = !teamName;

  let cls = 'bracket-team';
  if (isTbd) cls += ' bracket-team--tbd';
  else if (isWinner) cls += ' bracket-team--winner';
  row.className = cls;

  // Flag
  if (!isTbd) {
    const flag = buildFlagElement(teamName);
    row.appendChild(flag);
  }

  // Name
  const nameSpan = document.createElement('span');
  nameSpan.className = 'bracket-team-name';
  nameSpan.textContent = isTbd ? 'TBD' : teamName;
  row.appendChild(nameSpan);

  // Participant dot (if assigned)
  if (!isTbd && assignments) {
    const participant = assignments.get(teamName);
    if (participant) {
      row.appendChild(buildParticipantChip(participant));
    }
  }

  // Score
  const scoreSpan = document.createElement('span');
  scoreSpan.className = 'bracket-team-score';
  if (isPlayed && score !== null && !isTbd) {
    if (shootoutScore !== null && shootoutScore !== undefined) {
      scoreSpan.textContent = `${score} (${shootoutScore})`;
    } else {
      scoreSpan.textContent = String(score);
    }
  } else {
    scoreSpan.textContent = '';
  }
  row.appendChild(scoreSpan);

  return row;
}

/**
 * Build the full knockout bracket section with its own tabs.
 *
 * @param {Map<string, object>} fixtures
 * @param {Map<string, object>} schedule
 * @param {Map<string, string>} assignments
 * @returns {HTMLElement}
 */
function buildBracketSection(fixtures, schedule, assignments) {
  const section = document.createElement('div');
  section.className = 'bracket-container-tabbed';
  section.id = 'matrix-bracket-section';

  const rounds = collectKnockoutRounds(fixtures, schedule);
  const activeRounds = BRACKET_ROUNDS.filter(r => rounds.get(r).length > 0);

  if (activeRounds.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'loading-placeholder';
    msg.textContent = 'Knockout bracket not yet available.';
    section.appendChild(msg);
    return section;
  }

  // Make sure activeKnockoutTab is valid
  if (!activeKnockoutTab || !activeRounds.includes(activeKnockoutTab)) {
    // Find the first live or upcoming knockout match to determine default tab
    let defaultKnockoutTab = activeRounds[0];
    if (schedule && schedule.size > 0) {
      const sortedMatches = Array.from(schedule.values())
        .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
      for (const match of sortedMatches) {
        if (match.round && match.round !== 'GROUP') {
          const result = fixtures?.get(match.matchId);
          const status = result?.status ?? 'NS';
          if (status === 'LIVE' || status === 'NS') {
            if (activeRounds.includes(match.round)) {
              defaultKnockoutTab = match.round;
              break;
            }
          }
        }
      }
    }
    activeKnockoutTab = defaultKnockoutTab;
  }

  // 1. Secondary round tab strip
  const roundTabs = document.createElement('div');
  roundTabs.className = 'matrix-group-tabs';
  roundTabs.setAttribute('role', 'tablist');
  roundTabs.setAttribute('aria-label', 'Select knockout round');

  for (const roundKey of activeRounds) {
    const btn = document.createElement('button');
    btn.className = 'matrix-group-tab' + (roundKey === activeKnockoutTab ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', roundKey === activeKnockoutTab ? 'true' : 'false');
    btn.setAttribute('data-round', roundKey);
    btn.textContent = ROUND_LABELS[roundKey] ?? roundKey;
    roundTabs.appendChild(btn);
  }
  section.appendChild(roundTabs);

  // 2. Round tables wrapper
  const roundTablesWrapper = document.createElement('div');
  roundTablesWrapper.className = 'group-tables-wrapper'; // Reuse same wrapper style

  for (const roundKey of activeRounds) {
    const subPanel = document.createElement('div');
    subPanel.className = 'round-sub-panel';
    subPanel.setAttribute('data-round', roundKey);
    subPanel.hidden = roundKey !== activeKnockoutTab;
    
    // Create grid/list of matches
    const matchesEl = document.createElement('div');
    matchesEl.className = 'bracket-round-matches-tabbed';
    
    const matches = rounds.get(roundKey);
    for (const match of matches) {
      matchesEl.appendChild(buildBracketMatch(match, assignments));
    }
    
    subPanel.appendChild(matchesEl);
    roundTablesWrapper.appendChild(subPanel);
  }
  
  section.appendChild(roundTablesWrapper);

  // Attach event listeners for these tabs
  // We need to defer this or do it inline
  // Better to do it inline right here since we have the DOM nodes
  for (const btn of roundTabs.querySelectorAll('.matrix-group-tab')) {
    btn.addEventListener('click', () => {
      const rKey = btn.getAttribute('data-round');
      activeKnockoutTab = rKey;

      // Update tab states
      for (const tab of roundTabs.querySelectorAll('.matrix-group-tab')) {
        const isActive = tab.getAttribute('data-round') === rKey;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }

      // Show/hide round sub-panels
      for (const panel of roundTablesWrapper.querySelectorAll('.round-sub-panel')) {
        panel.hidden = panel.getAttribute('data-round') !== rKey;
      }
    });
  }

  return section;
}

// ---------------------------------------------------------------------------
// Group standings helpers
// ---------------------------------------------------------------------------

/**
 * Extract a sorted list of unique group letters from standings data.
 * Falls back to an inferred list from "Group X" names.
 *
 * @param {object[]} standings - ApiStandingsGroup[]
 * @returns {string[]} sorted group letters, e.g. ["A","B","C",...]
 */
function extractGroupLetters(standings) {
  const letters = new Set();
  for (const group of standings) {
    // group.group is like "Group A"
    const match = group.group.match(/Group\s+([A-Z])/i);
    if (match) letters.add(match[1].toUpperCase());
  }
  return [...letters].sort();
}

/**
 * Build the standings table for a single group.
 *
 * @param {object} groupData - ApiStandingsGroup
 * @param {Map<string, string>} assignments - teamName → participantName
 * @returns {HTMLElement}
 */
function buildGroupTable(groupData, assignments) {
  const wrapper = document.createElement('div');
  wrapper.className = 'standings-table-wrapper';

  const table = document.createElement('table');
  table.className = 'standings-table';
  table.setAttribute('aria-label', `${groupData.group} standings`);

  // Header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th class="standings-col-pos" scope="col">Pos</th>
      <th class="standings-col-flag" scope="col"></th>
      <th class="standings-col-team" scope="col">Team</th>
      <th class="standings-col-stat" scope="col">P</th>
      <th class="standings-col-stat" scope="col">W</th>
      <th class="standings-col-stat" scope="col">D</th>
      <th class="standings-col-stat" scope="col">L</th>
      <th class="standings-col-stat" scope="col">GF</th>
      <th class="standings-col-stat" scope="col">GA</th>
      <th class="standings-col-stat" scope="col">GD</th>
      <th class="standings-col-stat standings-col-pts" scope="col">Pts</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  const rows = groupData.standings ?? [];
  rows.forEach((entry, idx) => {
    const teamName = entry.team?.name ?? '';
    const participant = assignments?.get(teamName) ?? null;
    const isQualified = idx < 2; // top-2 per group qualify

    const tr = document.createElement('tr');
    let rowClass = 'standings-row';
    if (isQualified) rowClass += ' standings-row--qualified';
    if (participant) rowClass += ' standings-row--assigned';
    tr.className = rowClass;

    // Pos cell (with qualification marker)
    const posCell = document.createElement('td');
    posCell.className = 'standings-col-pos';
    const posSpan = document.createElement('span');
    posSpan.textContent = String(entry.rank);
    posCell.appendChild(posSpan);
    if (isQualified) {
      const check = document.createElement('span');
      check.className = 'qualification-mark';
      check.textContent = '✓';
      check.setAttribute('aria-label', 'Qualified');
      posCell.appendChild(check);
    }
    tr.appendChild(posCell);

    // Flag cell
    const flagCell = document.createElement('td');
    flagCell.className = 'standings-col-flag';
    flagCell.appendChild(buildFlagElement(teamName));
    tr.appendChild(flagCell);

    // Team name cell
    const nameCell = document.createElement('td');
    nameCell.className = 'standings-col-team';
    const nameSpan = document.createElement('span');
    nameSpan.className = participant ? 'team-name-assigned' : 'team-name';
    nameSpan.textContent = teamName;
    nameCell.appendChild(nameSpan);
    if (participant) {
      nameCell.appendChild(buildParticipantChip(participant));
    }
    tr.appendChild(nameCell);

    // Stat cells — read directly from API data, no arithmetic
    const stats = [
      entry.all?.played,
      entry.all?.win,
      entry.all?.draw,
      entry.all?.lose,
      entry.all?.goals?.for,
      entry.all?.goals?.against,
      entry.goalsDiff,
      entry.points,
    ];
    stats.forEach((val, i) => {
      const td = document.createElement('td');
      td.className = i === 7 ? 'standings-col-stat standings-col-pts' : 'standings-col-stat';
      td.textContent = val !== null && val !== undefined ? String(val) : '—';
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

/**
 * Build a special standings table for ranking the best 3rd-place teams across all groups.
 * 
 * @param {object[]} standings - ApiStandingsGroup[]
 * @param {Map<string, string>} assignments
 * @returns {HTMLElement}
 */
function buildThirdPlaceTable(standings, assignments) {
  const wrapper = document.createElement('div');
  wrapper.className = 'standings-table-wrapper';

  const table = document.createElement('table');
  table.className = 'standings-table';
  table.setAttribute('aria-label', 'Best 3rd-place ranking');

  // 1. Extract 3rd place teams from each group
  const thirdPlaceTeams = standings.map(group => {
    const third = group.standings[2]; // Index 2 is the 3rd team
    return {
      ...third,
      groupName: group.group.replace('Group ', '')
    };
  }).filter(Boolean);

  // 2. Sort by official FIFA rules for 3rd place teams
  thirdPlaceTeams.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalsDiff !== a.goalsDiff) return b.goalsDiff - a.goalsDiff;
    if (b.all.goals.for !== a.all.goals.for) return b.all.goals.for - a.all.goals.for;
    
    // Fallback tie-breaker (FIFA uses Wins, then Fair Play, then Ranking)
    // We only have Wins available.
    if (b.all.win !== a.all.win) return b.all.win - a.all.win;
    
    // Final fallback: Alphabetical
    return a.team.name.localeCompare(b.team.name);
  });

  // Header
  const headerContainer = document.createElement('div');
  headerContainer.className = 'matrix-third-header';
  headerContainer.innerHTML = `
    <p class="matrix-third-info">
      Top 8 teams advance. Tie-breakers: Pts > GD > GF > Wins. 
      <span class="matrix-third-note">(Disciplinary points and FIFA rankings are not available in this dashboard).</span>
    </p>
  `;
  wrapper.appendChild(headerContainer);

  // Header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th class="standings-col-pos" scope="col">Rank</th>
      <th class="standings-col-flag" scope="col">Grp</th>
      <th class="standings-col-flag" scope="col"></th>
      <th class="standings-col-team" scope="col">Team</th>
      <th class="standings-col-stat" scope="col">P</th>
      <th class="standings-col-stat" scope="col">W</th>
      <th class="standings-col-stat" scope="col">D</th>
      <th class="standings-col-stat" scope="col">L</th>
      <th class="standings-col-stat" scope="col">GF</th>
      <th class="standings-col-stat" scope="col">GA</th>
      <th class="standings-col-stat" scope="col">GD</th>
      <th class="standings-col-stat standings-col-pts" scope="col">Pts</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  thirdPlaceTeams.forEach((entry, idx) => {
    const teamName = entry.team?.name ?? '';
    const participant = assignments?.get(teamName) ?? null;
    const isQualified = idx < 8; // Top 8 of 12 advance

    const tr = document.createElement('tr');
    let rowClass = 'standings-row';
    if (isQualified) rowClass += ' standings-row--qualified';
    if (participant) rowClass += ' standings-row--assigned';
    tr.className = rowClass;

    // Rank cell
    const rankCell = document.createElement('td');
    rankCell.className = 'standings-col-pos';
    rankCell.textContent = String(idx + 1);
    if (isQualified) {
      const check = document.createElement('span');
      check.className = 'qualification-mark';
      check.textContent = '✓';
      rankCell.appendChild(check);
    }
    tr.appendChild(rankCell);

    // Group cell
    const groupCell = document.createElement('td');
    groupCell.className = 'standings-col-flag';
    groupCell.style.fontWeight = '700';
    groupCell.textContent = entry.groupName;
    tr.appendChild(groupCell);

    // Flag cell
    const flagCell = document.createElement('td');
    flagCell.className = 'standings-col-flag';
    flagCell.appendChild(buildFlagElement(teamName));
    tr.appendChild(flagCell);

    // Team name cell
    const nameCell = document.createElement('td');
    nameCell.className = 'standings-col-team';
    const nameSpan = document.createElement('span');
    nameSpan.className = participant ? 'team-name-assigned' : 'team-name';
    nameSpan.textContent = teamName;
    nameCell.appendChild(nameSpan);
    if (participant) {
      nameCell.appendChild(buildParticipantChip(participant));
    }
    tr.appendChild(nameCell);

    // Stat cells
    const stats = [
      entry.all?.played,
      entry.all?.win,
      entry.all?.draw,
      entry.all?.lose,
      entry.all?.goals?.for,
      entry.all?.goals?.against,
      entry.goalsDiff,
      entry.points,
    ];
    stats.forEach((val, i) => {
      const td = document.createElement('td');
      td.className = i === 7 ? 'standings-col-stat standings-col-pts' : 'standings-col-stat';
      td.textContent = val !== null && val !== undefined ? String(val) : '—';
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render the tournament matrix into #matrix-content.
 *
 * Tab switching is done purely by show/hide of sub-sections — no re-render.
 * Active tab is preserved in module-level variables across re-renders.
 *
 * @param {object[]} standings - ApiStandingsGroup[] direct from API
 * @param {Map<string, object>} fixtures - matchId → ApiMatchResult
 * @param {Map<string, object>} schedule - matchId → ScheduleEntry
 * @param {Map<string, string>} assignments - teamName → participantName
 */
export function render(standings, fixtures, schedule, assignments) {
  const container = document.getElementById('matrix-content');
  if (!container) return;

  // Graceful empty state
  if (!standings || standings.length === 0) {
    container.innerHTML = '<p class="loading-placeholder">Loading tournament data…</p>';
    return;
  }

  // Determine whether to show the knockout tab
  const showKnockout = hasKnockoutData(fixtures ?? new Map(), schedule ?? new Map());

  // Dynamic tab initialization based on where we are at in the tournament
  if (activeMainTab === null || activeGroupTab === null) {
    let defaultMainTab = 'group';
    let defaultGroupTab = 'A';

    if (schedule && schedule.size > 0) {
      const sortedMatches = Array.from(schedule.values())
        .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

      let activeMatch = null;
      for (const match of sortedMatches) {
        const result = fixtures?.get(match.matchId);
        const status = result?.status ?? 'NS';
        if (status === 'LIVE' || status === 'NS') {
          activeMatch = match;
          break;
        }
      }

      if (activeMatch) {
        if (activeMatch.round && activeMatch.round !== 'GROUP') {
          defaultMainTab = 'knockout';
        } else {
          defaultMainTab = 'group';
          if (activeMatch.group) {
            defaultGroupTab = activeMatch.group;
          }
        }
      } else {
        // If all matches are completed, default to knockout
        defaultMainTab = 'knockout';
      }
    }

    if (activeMainTab === null) {
      activeMainTab = showKnockout ? defaultMainTab : 'group';
    }
    if (activeGroupTab === null) {
      activeGroupTab = defaultGroupTab;
    }
  }

  // If active tab is knockout but no knockout data, fall back to group
  if (activeMainTab === 'knockout' && !showKnockout) {
    activeMainTab = 'group';
  }

  // Ensure active group is valid given current standings
  const groupLetters = extractGroupLetters(standings);
  if (groupLetters.length > 0 && !groupLetters.includes(activeGroupTab)) {
    activeGroupTab = groupLetters[0];
  }

  // Full rebuild on each render (simple and correct; the DOM is not huge)
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  // -------------------------------------------------------------------------
  // 1. Main pill tab strip: "Group Stage" | "Knockout Bracket"
  // -------------------------------------------------------------------------
  const mainTabs = document.createElement('div');
  mainTabs.className = 'matrix-tabs';
  mainTabs.setAttribute('role', 'tablist');
  mainTabs.setAttribute('aria-label', 'Tournament view');

  const tabGroup = document.createElement('button');
  tabGroup.className = 'matrix-tab' + (activeMainTab === 'group' && !isThirdPlaceRankingActive ? ' active' : '');
  tabGroup.setAttribute('role', 'tab');
  tabGroup.setAttribute('aria-selected', activeMainTab === 'group' && !isThirdPlaceRankingActive ? 'true' : 'false');
  tabGroup.setAttribute('aria-controls', 'matrix-group-panel');
  tabGroup.textContent = 'Group Stage';
  mainTabs.appendChild(tabGroup);

  const tabThird = document.createElement('button');
  tabThird.className = 'matrix-tab' + (activeMainTab === 'group' && isThirdPlaceRankingActive ? ' active' : '');
  tabThird.setAttribute('role', 'tab');
  tabThird.setAttribute('aria-selected', activeMainTab === 'group' && isThirdPlaceRankingActive ? 'true' : 'false');
  tabThird.setAttribute('aria-controls', 'matrix-third-panel');
  tabThird.textContent = '3rd Place Ranking';
  mainTabs.appendChild(tabThird);

  let tabKnockout = null;
  if (showKnockout) {
    tabKnockout = document.createElement('button');
    tabKnockout.className = 'matrix-tab' + (activeMainTab === 'knockout' ? ' active' : '');
    tabKnockout.setAttribute('role', 'tab');
    tabKnockout.setAttribute('aria-selected', activeMainTab === 'knockout' ? 'true' : 'false');
    tabKnockout.setAttribute('aria-controls', 'matrix-bracket-panel');
    tabKnockout.textContent = 'Knockout Bracket';
    mainTabs.appendChild(tabKnockout);
  }

  fragment.appendChild(mainTabs);

  // -------------------------------------------------------------------------
  // 2. Group Stage panel
  // -------------------------------------------------------------------------
  const groupPanel = document.createElement('div');
  groupPanel.id = 'matrix-group-panel';
  groupPanel.setAttribute('role', 'tabpanel');
  groupPanel.setAttribute('aria-labelledby', 'matrix-tab-group');
  groupPanel.hidden = activeMainTab !== 'group';

  // Secondary group tab strip
  const groupTabs = document.createElement('div');
  groupTabs.className = 'matrix-group-tabs';
  groupTabs.setAttribute('role', 'tablist');
  groupTabs.setAttribute('aria-label', 'Select group');

  for (const letter of groupLetters) {
    const btn = document.createElement('button');
    btn.className = 'matrix-group-tab' + (letter === activeGroupTab ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', letter === activeGroupTab ? 'true' : 'false');
    btn.setAttribute('data-group', letter);
    btn.textContent = `Group ${letter}`;
    groupTabs.appendChild(btn);
  }

  groupPanel.appendChild(groupTabs);

  // Group table container — one sub-panel per group
  const groupTablesWrapper = document.createElement('div');
  groupTablesWrapper.className = 'group-tables-wrapper';

  for (const groupData of standings) {
    const letterMatch = groupData.group.match(/Group\s+([A-Z])/i);
    const letter = letterMatch ? letterMatch[1].toUpperCase() : '?';

    const subPanel = document.createElement('div');
    subPanel.className = 'group-sub-panel';
    subPanel.setAttribute('data-group', letter);
    subPanel.hidden = letter !== activeGroupTab;
    subPanel.appendChild(buildGroupTable(groupData, assignments));
    groupTablesWrapper.appendChild(subPanel);
  }

  groupPanel.appendChild(groupTablesWrapper);
  fragment.appendChild(groupPanel);

  // -------------------------------------------------------------------------
  // 3. 3rd Place Ranking panel
  // -------------------------------------------------------------------------
  const thirdPanel = document.createElement('div');
  thirdPanel.id = 'matrix-third-panel';
  thirdPanel.setAttribute('role', 'tabpanel');
  thirdPanel.hidden = activeMainTab !== 'group' || !isThirdPlaceRankingActive;
  thirdPanel.appendChild(buildThirdPlaceTable(standings, assignments));
  fragment.appendChild(thirdPanel);

  // -------------------------------------------------------------------------
  // 4. Knockout Bracket panel
  // -------------------------------------------------------------------------
  let bracketPanel = null;
  if (showKnockout) {
    bracketPanel = document.createElement('div');
    bracketPanel.id = 'matrix-bracket-panel';
    bracketPanel.setAttribute('role', 'tabpanel');
    bracketPanel.setAttribute('aria-labelledby', 'matrix-tab-knockout');
    bracketPanel.hidden = activeMainTab !== 'knockout';
    bracketPanel.appendChild(buildBracketSection(
      fixtures ?? new Map(),
      schedule ?? new Map(),
      assignments
    ));
    fragment.appendChild(bracketPanel);
  }

  container.appendChild(fragment);

  // -------------------------------------------------------------------------
  // 5. Wire tab click events (after DOM is in place)
  // -------------------------------------------------------------------------

  // Main tabs
  tabGroup.addEventListener('click', () => {
    activeMainTab = 'group';
    isThirdPlaceRankingActive = false;
    tabGroup.classList.add('active');
    tabGroup.setAttribute('aria-selected', 'true');
    tabThird.classList.remove('active');
    tabThird.setAttribute('aria-selected', 'false');
    if (tabKnockout) {
      tabKnockout.classList.remove('active');
      tabKnockout.setAttribute('aria-selected', 'false');
    }
    groupPanel.hidden = false;
    thirdPanel.hidden = true;
    if (bracketPanel) bracketPanel.hidden = true;
  });

  tabThird.addEventListener('click', () => {
    activeMainTab = 'group';
    isThirdPlaceRankingActive = true;
    tabThird.classList.add('active');
    tabThird.setAttribute('aria-selected', 'true');
    tabGroup.classList.remove('active');
    tabGroup.setAttribute('aria-selected', 'false');
    if (tabKnockout) {
      tabKnockout.classList.remove('active');
      tabKnockout.setAttribute('aria-selected', 'false');
    }
    thirdPanel.hidden = false;
    groupPanel.hidden = true;
    if (bracketPanel) bracketPanel.hidden = true;
  });

  if (tabKnockout && bracketPanel) {
    tabKnockout.addEventListener('click', () => {
      activeMainTab = 'knockout';
      isThirdPlaceRankingActive = false;
      tabKnockout.classList.add('active');
      tabKnockout.setAttribute('aria-selected', 'true');
      tabGroup.classList.remove('active');
      tabGroup.setAttribute('aria-selected', 'false');
      tabThird.classList.remove('active');
      tabThird.setAttribute('aria-selected', 'false');
      bracketPanel.hidden = false;
      groupPanel.hidden = true;
      thirdPanel.hidden = true;
    });
  }

  // Group sub-tabs
  for (const btn of groupTabs.querySelectorAll('.matrix-group-tab')) {
    btn.addEventListener('click', () => {
      const letter = btn.getAttribute('data-group');
      activeGroupTab = letter;

      // Update tab states
      for (const tab of groupTabs.querySelectorAll('.matrix-group-tab')) {
        const isActive = tab.getAttribute('data-group') === letter;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }

      // Show/hide group sub-panels
      for (const panel of groupTablesWrapper.querySelectorAll('.group-sub-panel')) {
        panel.hidden = panel.getAttribute('data-group') !== letter;
      }
    });
  }
}
