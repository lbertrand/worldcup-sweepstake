/**
 * ui/matchTicker.js — Match Ticker component
 *
 * Renders matches organized by day with navigation controls.
 *
 * Selection logic:
 * - Always pin LIVE matches to the top.
 * - Display all other matches (completed, upcoming) for the `activeDateStr`.
 * - Provides Previous/Next buttons to cycle through active tournament days.
 */

// Local State
let activeDateStr = null;
let activeDatesList = [];

// ---------------------------------------------------------------------------
// Flag lookup — FIFA team name → ISO 3166-1 alpha-2 country code (lowercase)
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
// Helpers
// ---------------------------------------------------------------------------

function isoToFlagEmoji(isoCode) {
  if (!isoCode || isoCode.includes('-')) {
    const subNationalEmoji = { 'gb-eng': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'gb-sct': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'gb-wls': '🏴󠁧󠁢󠁷󠁬󠁳󠁿' };
    return subNationalEmoji[isoCode] ?? '🏳';
  }
  const upper = isoCode.toUpperCase();
  return String.fromCodePoint(
    0x1F1E6 + (upper.codePointAt(0) - 65),
    0x1F1E6 + (upper.codePointAt(1) - 65)
  );
}

function buildFlagElement(teamName) {
  const isoCode = TEAM_FLAG_MAP[teamName];
  const fallbackEmoji = isoCode ? isoToFlagEmoji(isoCode) : '🏳';

  if (isoCode) {
    const img = document.createElement('img');
    img.src = `https://flagcdn.com/${isoCode}.svg`;
    img.width = 32;
    img.height = 24;
    img.alt = teamName;
    img.loading = 'lazy';
    img.className = 'flag-img flag-img--ticker';
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

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);

const ROUND_LABELS = {
  'R32':   'Round of 32',
  'R16':   'Round of 16',
  'QF':    'Quarter-finals',
  'SF':    'Semi-finals',
  '3RD':   '3rd Place',
  'FINAL': 'Final',
};

// ---------------------------------------------------------------------------
// Date Navigation Logic
// ---------------------------------------------------------------------------

/**
 * Returns YYYY-MM-DD for a given Date object in local time.
 */
function getLocalDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Update the activeDatesList from the schedule.
 */
function updateAvailableDates(schedule) {
  const dates = new Set();
  for (const match of schedule.values()) {
    if (match.kickoff) {
      dates.add(getLocalDateStr(new Date(match.kickoff)));
    }
  }
  activeDatesList = Array.from(dates).sort();
}

/**
 * Set activeDateStr on initialization.
 */
function initializeActiveDate() {
  if (activeDateStr !== null || activeDatesList.length === 0) return;

  const todayStr = getLocalDateStr(new Date());
  
  if (activeDatesList.includes(todayStr)) {
    activeDateStr = todayStr;
    return;
  }

  // If today has no matches, try to find the closest past day
  const pastDates = activeDatesList.filter(d => d < todayStr);
  const futureDates = activeDatesList.filter(d => d > todayStr);

  if (pastDates.length > 0) {
    activeDateStr = pastDates[pastDates.length - 1]; // most recent past date
  } else if (futureDates.length > 0) {
    activeDateStr = futureDates[0]; // nearest future date
  } else {
    activeDateStr = activeDatesList[0];
  }
}

// ---------------------------------------------------------------------------
// Selection logic
// ---------------------------------------------------------------------------

function categoriseMatches(schedule, results) {
  const live = [];
  const dayMatches = [];

  for (const [matchId, scheduleEntry] of schedule) {
    const result = results.get(matchId) ?? null;
    const status = result?.status ?? 'NS';
    const matchDateStr = scheduleEntry.kickoff ? getLocalDateStr(new Date(scheduleEntry.kickoff)) : null;
    
    const item = { scheduleEntry, result };

    if (status === 'LIVE') {
      live.push(item);
    } else if (matchDateStr === activeDateStr) {
      dayMatches.push(item);
    }
  }

  // Include results not in schedule
  for (const [matchId, result] of results) {
    if (!schedule.has(matchId)) {
      if (result?.status === 'LIVE') {
        live.push({ scheduleEntry: null, result });
      }
    }
  }

  // Sort day matches by kickoff
  dayMatches.sort((a, b) => {
    const timeA = a.scheduleEntry?.kickoff ? new Date(a.scheduleEntry.kickoff).getTime() : 0;
    const timeB = b.scheduleEntry?.kickoff ? new Date(b.scheduleEntry.kickoff).getTime() : 0;
    return timeA - timeB;
  });

  return { live, dayMatches };
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function buildStatusPill(result, kickoff) {
  const status = result?.status ?? 'NS';
  const pill = document.createElement('div');

  if (status === 'LIVE') {
    pill.className = 'status-pill status-live';
    const dot = document.createElement('span');
    dot.className = 'live-dot';
    dot.textContent = '●';
    const label = document.createElement('span');
    label.textContent = ' LIVE';
    pill.appendChild(dot);
    pill.appendChild(label);
    if (result.minute != null) {
      const minute = document.createElement('span');
      minute.className = 'live-minute';
      minute.textContent = ` ${result.minute}'`;
      pill.appendChild(minute);
    }
  } else if (FINISHED_STATUSES.has(status)) {
    pill.className = 'status-pill status-finished';
    pill.textContent = status; 
  } else {
    pill.className = 'status-pill status-upcoming';
    const timeStr = kickoff ? new Date(kickoff).toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';
    pill.textContent = `⏰ ${timeStr}`;
  }
  return pill;
}

function buildTeamCell(teamName, assignments, side) {
  const cell = document.createElement('div');
  cell.className = `team-cell team-cell--${side}`;

  const flag = buildFlagElement(teamName);
  const nameSpan = document.createElement('span');
  nameSpan.className = 'team-name';
  nameSpan.textContent = teamName;

  if (side === 'home') {
    cell.appendChild(flag);
    cell.appendChild(nameSpan);
  } else {
    cell.appendChild(nameSpan);
    cell.appendChild(flag);
  }

  const participant = assignments?.get(teamName);
  if (participant) {
    const chip = document.createElement('span');
    chip.className = 'participant-chip';
    chip.textContent = participant;
    cell.appendChild(chip);
  }
  return cell;
}

function buildScoreCell(result) {
  const cell = document.createElement('div');
  cell.className = 'match-score';
  const status = result?.status ?? 'NS';

  if (status === 'LIVE' || FINISHED_STATUSES.has(status)) {
    let scoreText = `${result?.homeScore ?? 0}–${result?.awayScore ?? 0}`;
    if (result?.homeShootoutScore != null || result?.awayShootoutScore != null) {
      const hPen = result.homeShootoutScore ?? 0;
      const aPen = result.awayShootoutScore ?? 0;
      scoreText += ` (${hPen}–${aPen} pen)`;
    }
    cell.textContent = scoreText;
  } else {
    cell.textContent = 'vs';
    cell.classList.add('match-score--upcoming');
  }
  return cell;
}

function buildTickerRow(item, assignments) {
  const { scheduleEntry, result } = item;
  const homeTeam = result?.homeTeam ?? scheduleEntry?.homeTeam ?? 'Unknown';
  const awayTeam = result?.awayTeam ?? scheduleEntry?.awayTeam ?? 'Unknown';
  const kickoff = scheduleEntry?.kickoff ?? null;
  const status = result?.status ?? 'NS';
  const round = scheduleEntry?.round ?? result?.round ?? 'Unknown';
  const group = scheduleEntry?.group ?? result?.group ?? null;

  const row = document.createElement('div');
  row.className = 'ticker-row';

  if (status === 'LIVE') row.classList.add('ticker-row--live');
  else if (FINISHED_STATUSES.has(status)) row.classList.add('ticker-row--finished');
  else row.classList.add('ticker-row--upcoming');

  const metaCol = document.createElement('div');
  metaCol.className = 'ticker-meta';
  metaCol.appendChild(buildStatusPill(result, kickoff));

  let stageText = '';
  if (round === 'GROUP' && group) {
    stageText = `Group ${group}`;
  } else if (round !== 'GROUP' && round !== 'Unknown') {
    stageText = ROUND_LABELS[round] || round;
  }

  if (stageText) {
    const stageEl = document.createElement('div');
    stageEl.className = 'ticker-stage';
    stageEl.textContent = stageText;
    metaCol.appendChild(stageEl);
  }

  row.appendChild(metaCol);
  row.appendChild(buildTeamCell(homeTeam, assignments, 'home'));
  row.appendChild(buildScoreCell(result));
  row.appendChild(buildTeamCell(awayTeam, assignments, 'away'));

  return row;
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

let listenersAttached = false;
let globalSchedule = null;
let globalResults = null;
let globalAssignments = null;

export function render(schedule, results, assignments) {
  globalSchedule = schedule;
  globalResults = results;
  globalAssignments = assignments;

  const container = document.getElementById('ticker-content');
  if (!container) return;

  if (!schedule || schedule.size === 0) {
    container.innerHTML = '<p class="loading-placeholder">No fixtures loaded.</p>';
    return;
  }

  updateAvailableDates(schedule);
  initializeActiveDate();

  if (activeDatesList.length === 0) {
    container.innerHTML = '<p class="loading-placeholder">No matches to display.</p>';
    return;
  }

  const { live, dayMatches } = categoriseMatches(schedule, results);

  const fragment = document.createDocumentFragment();

  // 1. Navigation Header
  const navDiv = document.createElement('div');
  navDiv.className = 'ticker-nav';
  
  const currentIndex = activeDatesList.indexOf(activeDateStr);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < activeDatesList.length - 1;
  const todayStr = getLocalDateStr(new Date());
  const isToday = activeDateStr === todayStr;

  navDiv.innerHTML = `
    <button class="ticker-nav-btn" id="ticker-prev" ${!hasPrev ? 'disabled' : ''}>◀</button>
    <div class="ticker-nav-center">
      <span class="ticker-nav-date">${isToday ? 'Today, ' : ''}${formatDisplayDate(activeDateStr)}</span>
      ${!isToday && activeDatesList.includes(todayStr) ? '<button class="ticker-nav-today" id="ticker-today">Go to Today</button>' : ''}
    </div>
    <button class="ticker-nav-btn" id="ticker-next" ${!hasNext ? 'disabled' : ''}>▶</button>
  `;
  fragment.appendChild(navDiv);

  // 2. Live matches pinned at top
  for (const item of live) {
    fragment.appendChild(buildTickerRow(item, assignments));
  }

  // Visual separator if there are live matches and day matches
  if (live.length > 0 && dayMatches.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'ticker-divider';
    fragment.appendChild(divider);
  }

  // 3. Matches for the selected date
  if (dayMatches.length === 0) {
    const p = document.createElement('p');
    p.className = 'loading-placeholder';
    p.textContent = 'No matches scheduled for this date.';
    fragment.appendChild(p);
  } else {
    for (const item of dayMatches) {
      // Don't render a match twice if it's both on this day AND live
      if (item.result?.status !== 'LIVE') {
        fragment.appendChild(buildTickerRow(item, assignments));
      }
    }
  }

  container.innerHTML = '';
  container.appendChild(fragment);

  // Attach nav event listeners
  if (!listenersAttached) {
    container.addEventListener('click', (e) => {
      if (e.target.id === 'ticker-today') {
        activeDateStr = getLocalDateStr(new Date());
        render(globalSchedule, globalResults, globalAssignments);
      } else if (e.target.id === 'ticker-prev' || e.target.id === 'ticker-next') {
        const step = e.target.id === 'ticker-prev' ? -1 : 1;
        const newIdx = activeDatesList.indexOf(activeDateStr) + step;
        if (newIdx >= 0 && newIdx < activeDatesList.length) {
          activeDateStr = activeDatesList[newIdx];
          render(globalSchedule, globalResults, globalAssignments);
        }
      }
    });
    listenersAttached = true;
  }
}
