/**
 * ui/leaderboard.js — Leaderboard component
 *
 * Renders the ranked participant list with scores, team flags, and
 * medal emojis for the top 3. Updates DOM in-place (no full re-render).
 *
 * Visual features:
 * - Medal emojis 🥇🥈🥉 for top 3 ranks; plain numbers thereafter
 * - Tied participants: same rank number with "=" suffix, indented style
 * - Gold/silver/bronze left-border accent (3px) on top-3 rows
 * - Team flags: <img> from api-sports.io CDN; fallback to flag emoji
 * - Brief green flash animation on score cells when value increases
 */

import { sortLeaderboard } from '../pointsEngine.js';

// ---------------------------------------------------------------------------
// Flag lookup — FIFA team name → ISO 3166-1 alpha-2 country code (lowercase)
// Covers all 48 WC2026 qualified teams.
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
// Unicode flag emoji helper
// Converts a 2-letter ISO code to a regional indicator emoji pair.
// Does not support sub-national codes like "gb-eng" — those fall back to ?.
// ---------------------------------------------------------------------------
/**
 * @param {string} isoCode - lowercase 2-letter ISO code (e.g. "fr") or sub-national (e.g. "gb-eng")
 * @returns {string} flag emoji or "?" if not convertible
 */
function isoToFlagEmoji(isoCode) {
  if (!isoCode || isoCode.includes('-')) {
    // Sub-national codes (gb-eng, gb-sct, gb-wls) — use known emoji directly
    const subNationalEmoji = {
      'gb-eng': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      'gb-sct': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
      'gb-wls': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    };
    return subNationalEmoji[isoCode] ?? '🏳';
  }
  const upper = isoCode.toUpperCase();
  // Each letter is offset from 'A' by the regional indicator base (0x1F1E6)
  return String.fromCodePoint(
    0x1F1E6 + (upper.codePointAt(0) - 65),
    0x1F1E6 + (upper.codePointAt(1) - 65)
  );
}

/**
 * Build an <img> element for the team flag, with emoji fallback on error.
 *
 * @param {string} teamName
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
      // Replace failed img with a text span containing the fallback emoji
      const span = document.createElement('span');
      span.className = 'flag-emoji';
      span.textContent = fallbackEmoji;
      span.setAttribute('aria-label', teamName);
      img.replaceWith(span);
    };
    return img;
  }

  // No ISO code found — use emoji directly
  const span = document.createElement('span');
  span.className = 'flag-emoji';
  span.textContent = fallbackEmoji;
  span.setAttribute('aria-label', teamName);
  return span;
}

// ---------------------------------------------------------------------------
// Rank helpers
// ---------------------------------------------------------------------------

/** Medal emoji for ranks 1–3; plain rank string thereafter. */
const MEDAL = ['🥇', '🥈', '🥉'];

/**
 * @param {number} rank - 1-based rank
 * @param {boolean} tied - whether this participant is tied with another
 * @returns {string}
 */
function rankLabel(rank, tied) {
  if (rank <= 3) return MEDAL[rank - 1];
  return tied ? `${rank}=` : `${rank}`;
}

/**
 * CSS class for the left-border accent on top-3 rows.
 * @param {number} rank
 * @returns {string|null}
 */
function rankAccentClass(rank) {
  return ['rank-gold', 'rank-silver', 'rank-bronze'][rank - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Score flash animation
// ---------------------------------------------------------------------------

/** Trigger the green flash on a score cell if its value increased. */
function maybeFlashScore(cell, newScore) {
  const prev = 'score' in cell.dataset ? Number(cell.dataset.score) : null;
  cell.dataset.score = String(newScore);

  if (prev !== null && newScore > prev) {
    cell.classList.remove('score-flash'); // reset if already animating
    // Force a reflow so removing+adding the class restarts the animation
    // eslint-disable-next-line no-unused-expressions
    cell.offsetWidth; // reading offsetWidth triggers reflow intentionally
    cell.classList.add('score-flash');
    cell.addEventListener(
      'animationend',
      () => cell.classList.remove('score-flash'),
      { once: true }
    );
  }
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Assign rank numbers to a sorted leaderboard array.
 * Participants with equal scores share the same rank and are marked as tied.
 *
 * @param {Array<[string, number]>} sorted - sorted [name, score] pairs
 * @returns {Array<{rank: number, tied: boolean}>}
 */
function computeRanks(sorted) {
  const ranks = [];
  for (let i = 0; i < sorted.length; i++) {
    const [, score] = sorted[i];
    if (i === 0) {
      ranks.push({ rank: 1, tied: false });
    } else {
      const [, prevScore] = sorted[i - 1];
      if (score === prevScore) {
        ranks[i - 1].tied = true;
        ranks.push({ rank: ranks[i - 1].rank, tied: true });
      } else {
        ranks.push({ rank: i + 1, tied: false });
      }
    }
  }
  return ranks;
}

/**
 * Render the leaderboard into #leaderboard-content.
 *
 * Updates in-place when rows already exist (matched by data-participant).
 * Creates the full table on first call.
 *
 * @param {Map<string, number>} scores       - participantName → sweepstake score
 * @param {Map<string, string>} assignments  - teamCode → participantName
 */
export function render(scores, assignments) {
  const container = document.getElementById('leaderboard-content');
  if (!container) return;

  // Sort participants descending by score, alphabetical tiebreak
  const sorted = sortLeaderboard(scores);

  if (sorted.length === 0) {
    container.innerHTML = '<p class="loading-placeholder">No scores yet.</p>';
    return;
  }

  // Build reverse map: participantName → [teamNames]
  /** @type {Map<string, string[]>} */
  const participantTeams = new Map();
  for (const [team, participant] of assignments) {
    if (!participantTeams.has(participant)) participantTeams.set(participant, []);
    participantTeams.get(participant).push(team);
  }

  // Compute ranks (shared rank for ties, "=" suffix)
  // ranks[i] = { rank: number, tied: boolean }
  const ranks = computeRanks(sorted);

  // -------------------------------------------------------------------------
  // In-place update: check if a leaderboard table already exists
  // -------------------------------------------------------------------------
  let table = container.querySelector('table.leaderboard-table');

  if (!table) {
    // First render — build the full table structure
    container.innerHTML = '';
    table = document.createElement('table');
    table.className = 'leaderboard-table';
    table.setAttribute('aria-label', 'Leaderboard');

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th class="col-rank" scope="col">#</th>
        <th class="col-name" scope="col">Participant</th>
        <th class="col-flags" scope="col">Teams</th>
        <th class="col-score" scope="col">Score</th>
      </tr>
    `;
    table.appendChild(thead);
    table.appendChild(document.createElement('tbody'));
    container.appendChild(table);
  }

  const tbody = table.querySelector('tbody');

  // Build a map of existing rows by participant name for efficient lookup
  /** @type {Map<string, HTMLTableRowElement>} */
  const existingRows = new Map();
  for (const row of tbody.querySelectorAll('tr[data-participant]')) {
    existingRows.set(row.dataset.participant, row);
  }

  // Track which participants are in the new sorted list
  const seenParticipants = new Set();

  sorted.forEach(([name, score], idx) => {
    const { rank, tied } = ranks[idx];
    const teams = participantTeams.get(name) ?? [];
    seenParticipants.add(name);

    const row = upsertRow(existingRows, name);
    updateRowCells(row, { name, score, rank, tied, teams });

    // Ensure row is in correct position in DOM
    const currentRowAtIndex = tbody.children[idx];
    if (currentRowAtIndex !== row) {
      tbody.insertBefore(row, currentRowAtIndex ?? null);
    }
  });

  // Remove rows for participants no longer in the scores map
  for (const [name, row] of existingRows) {
    if (!seenParticipants.has(name)) {
      row.remove();
    }
  }
}

// ---------------------------------------------------------------------------
// Row helpers (extracted to keep render() complexity manageable)
// ---------------------------------------------------------------------------

/**
 * Get an existing row for a participant or create a new one.
 *
 * @param {Map<string, HTMLTableRowElement>} existingRows
 * @param {string} name
 * @returns {HTMLTableRowElement}
 */
function upsertRow(existingRows, name) {
  const existing = existingRows.get(name);
  if (existing) return existing;

  const row = document.createElement('tr');
  row.dataset.participant = name;
  row.innerHTML = `
    <td class="col-rank"></td>
    <td class="col-name"></td>
    <td class="col-flags"></td>
    <td class="col-score"></td>
  `;
  return row;
}

/**
 * Update all cells in a leaderboard row with new data.
 *
 * @param {HTMLTableRowElement} row
 * @param {{ name: string, score: number, rank: number, tied: boolean, teams: string[] }} data
 */
function updateRowCells(row, { name, score, rank, tied, teams }) {
  // Rank cell
  const rankCell = row.querySelector('.col-rank');
  rankCell.textContent = rankLabel(rank, tied);
  rankCell.setAttribute('aria-label', `Rank ${rank}${tied ? ' (tied)' : ''}`);

  // Name cell
  row.querySelector('.col-name').textContent = name;

  // Flags cell — rebuild only if the team list changed
  updateFlagsCell(row.querySelector('.col-flags'), teams);

  // Score cell with flash animation on increase
  const scoreCell = row.querySelector('.col-score');
  maybeFlashScore(scoreCell, score);
  scoreCell.textContent = String(score);

  // Row accent class (gold/silver/bronze for top 3)
  row.className = 'leaderboard-row';
  if (tied) row.classList.add('row-tied');
  const accent = rankAccentClass(rank);
  if (accent) row.classList.add(accent);
}

/**
 * Rebuild the flags cell only when the team list has changed.
 *
 * @param {HTMLTableCellElement} cell
 * @param {string[]} teams
 */
function updateFlagsCell(cell, teams) {
  const newFlagTeams = teams.join(',');
  if ((cell.dataset.teams ?? '') === newFlagTeams) return;

  cell.innerHTML = '';
  cell.dataset.teams = newFlagTeams;
  const fragment = document.createDocumentFragment();
  for (const team of teams) {
    const wrapper = document.createElement('span');
    wrapper.className = 'flag-wrapper';
    wrapper.title = team;
    wrapper.appendChild(buildFlagElement(team));
    fragment.appendChild(wrapper);
  }
  cell.appendChild(fragment);
}
