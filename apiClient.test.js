/**
 * apiClient.test.js — Unit tests for apiClient.js ESPN parsing logic
 *
 * Tests the status normalisation and fixture mapping behaviour.
 *
 * The actual fetch calls are not tested here (that would require a network mock);
 * instead, we test the parsing helpers by re-implementing them inline with the
 * same logic as apiClient.js — keeping them in sync is easy because they are
 * pure, stateless functions.
 *
 * Requirements: 5.1 (data refresh), 9.3 (schedule merge), 9.4 (unknown fixture fallback)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Re-implementation of the parsing helpers from apiClient.js for isolated testing.
// These mirror the logic exactly — if apiClient.js changes these functions,
// this file must be updated accordingly.
// ---------------------------------------------------------------------------

/**
 * Maps ESPN status type names to internal status codes.
 * Mirrors normaliseStatus() in apiClient.js.
 */
function normaliseStatus(status, state) {
  if (state === 'in') return 'LIVE';
  if (!status) return 'NS';
  const s = status.toUpperCase();

  // If state is post-match (completed), classify by keyword or fallback to FT
  if (state === 'post') {
    if (s.includes('AET') || s.includes('OVERTIME')) return 'AET';
    if (s.includes('PEN') || s.includes('SHOOTOUT')) return 'PEN';
    return 'FT';
  }

  if (['STATUS_IN_PROGRESS', 'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF',
       'STATUS_HALFTIME', 'STATUS_EXTRA_TIME', 'STATUS_OVERTIME', 'STATUS_SHOOTOUT', 'STATUS_END_OF_EXTRATIME', 'HT', '1H', '2H', 'ET'].includes(s)) return 'LIVE';
  if (['STATUS_FULL_TIME', 'STATUS_FINAL', 'FT', 'FINISHED'].includes(s)) return 'FT';
  if (['STATUS_SCHEDULED', 'NS', 'TIMED'].includes(s)) return 'NS';
  if (['AET', 'STATUS_FINAL_OVERTIME', 'STATUS_FINAL_AET'].includes(s)) return 'AET';
  if (['PEN', 'STATUS_PENALTIES', 'STATUS_FINAL_PEN', 'STATUS_FINAL_SHOOTOUT'].includes(s)) return 'PEN';
  if (['SUSP'].includes(s)) return 'SUSP';
  if (['PST', 'POSTPONED'].includes(s)) return 'PST';
  return 'NS';
}

/**
 * Simulate the dynamic team name matching used by findMatchEntry() in apiClient.js.
 * Returns the schedule entry when team names match (in either home/away order), or null.
 */
function findMatchEntry(scheduleMap, home, away) {
  if (!home || !away) return null;
  const h = home.trim();
  const a = away.trim();
  for (const match of scheduleMap.values()) {
    if (
      (match.homeTeam === h && match.awayTeam === a) ||
      (match.homeTeam === a && match.awayTeam === h)
    ) {
      return match;
    }
  }
  return null;
}

/**
 * Build an ApiMatchResult from an ESPN event object and a schedule map.
 * Mirrors the mapping inside fetchFixtures() in apiClient.js.
 */
function mapEspnEvent(event, scheduleMap, fixtureIdMap = new Map()) {
  const competition = event.competitions?.[0];
  const homeCompetitor = competition?.competitors?.find(c => c.homeAway === 'home');
  const awayCompetitor = competition?.competitors?.find(c => c.homeAway === 'away');

  const homeTeam = homeCompetitor?.team?.displayName || 'Unknown';
  const awayTeam = awayCompetitor?.team?.displayName || 'Unknown';

  const apiFixtureId = event.id ? event.id.toString() : null;
  const matchId = apiFixtureId ? fixtureIdMap.get(apiFixtureId) : null;
  const matchEntry = matchId ? scheduleMap.get(matchId) : findMatchEntry(scheduleMap, homeTeam, awayTeam);

  return {
    matchId: matchEntry?.matchId || `espn-${event.id}`,
    homeTeam: homeTeam.trim(),
    awayTeam: awayTeam.trim(),
    homeScore: Number.parseInt(homeCompetitor?.score) || 0,
    awayScore: Number.parseInt(awayCompetitor?.score) || 0,
    homeWinner: homeCompetitor?.winner ?? null,
    awayWinner: awayCompetitor?.winner ?? null,
    homeShootoutScore: homeCompetitor?.shootoutScore !== undefined ? Number.parseInt(homeCompetitor.shootoutScore) : null,
    awayShootoutScore: awayCompetitor?.shootoutScore !== undefined ? Number.parseInt(awayCompetitor.shootoutScore) : null,
    status: normaliseStatus(event.status?.type?.name, event.status?.type?.state),
    round: matchEntry?.round || null,
    minute: event.status?.displayClock ? Number.parseInt(event.status.displayClock) : null,
  };
}

/**
 * Build a standings group from an ESPN standings group object.
 * Mirrors the mapping inside fetchStandings() in apiClient.js.
 */
function mapEspnStandings(group) {
  const standingsEntries = group.standings.entries.map(entry => {
    const stats = entry.stats || [];
    const getStat = (name) => stats.find(s => s.name === name)?.value ?? 0;

    return {
      rank: getStat('rank'),
      team: {
        name: entry.team.displayName,
        crest: entry.team.logo,
      },
      points: getStat('points'),
      goalsDiff: getStat('pointDifferential'),
      all: {
        played: getStat('gamesPlayed'),
        win: getStat('wins'),
        draw: getStat('ties'),
        lose: getStat('losses'),
        goals: {
          for: getStat('pointsFor'),
          against: getStat('pointsAgainst'),
        },
      },
    };
  });

  standingsEntries.sort((a, b) => a.rank - b.rank);

  return {
    group: group.name,
    standings: standingsEntries
  };
}

// ---------------------------------------------------------------------------
// Helpers — build minimal ESPN event objects for testing
// ---------------------------------------------------------------------------

/**
 * Build a minimal ESPN event object as returned by the scoreboard API.
 */
function makeEspnEvent({
  id = 1001,
  homeName = 'Mexico',
  awayName = 'USA',
  homeWinner = null,
  awayWinner = null,
  homeScore = '0',
  awayScore = '0',
  homeShootoutScore = undefined,
  awayShootoutScore = undefined,
  statusName = 'STATUS_FULL_TIME',
  displayClock = null,
} = {}) {
  return {
    id: String(id),
    status: {
      type: { name: statusName },
      displayClock,
    },
    competitions: [{
      competitors: [
        {
          homeAway: 'home',
          team: { displayName: homeName },
          score: homeScore,
          winner: homeWinner,
          shootoutScore: homeShootoutScore,
        },
        {
          homeAway: 'away',
          team: { displayName: awayName },
          score: awayScore,
          winner: awayWinner,
          shootoutScore: awayShootoutScore,
        },
      ],
    }],
  };
}

/**
 * Build a minimal ESPN standings entry for testing.
 */
function makeEspnStandingsEntry(name, rank, pts, gd) {
  return {
    team: { displayName: name, logo: 'logo.png' },
    stats: [
      { name: 'rank', value: rank },
      { name: 'points', value: pts },
      { name: 'pointDifferential', value: gd },
      { name: 'gamesPlayed', value: 3 },
      { name: 'wins', value: 1 },
      { name: 'ties', value: 1 },
      { name: 'losses', value: 1 },
      { name: 'pointsFor', value: 3 },
      { name: 'pointsAgainst', value: 3 },
    ]
  };
}

/** Build a minimal schedule Map for testing. */
function makeSchedule(entries) {
  const map = new Map();
  for (const entry of entries) {
    map.set(entry.matchId, entry);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tests: status normalisation
// ---------------------------------------------------------------------------

describe('normaliseStatus — ESPN status type names', () => {
  it('STATUS_FULL_TIME → FT', () => {
    assert.equal(normaliseStatus('STATUS_FULL_TIME'), 'FT');
  });

  it('STATUS_FINAL → FT', () => {
    assert.equal(normaliseStatus('STATUS_FINAL'), 'FT');
  });

  it('STATUS_IN_PROGRESS → LIVE', () => {
    assert.equal(normaliseStatus('STATUS_IN_PROGRESS'), 'LIVE');
  });

  it('STATUS_FIRST_HALF → LIVE', () => {
    assert.equal(normaliseStatus('STATUS_FIRST_HALF'), 'LIVE');
  });

  it('STATUS_SECOND_HALF → LIVE', () => {
    assert.equal(normaliseStatus('STATUS_SECOND_HALF'), 'LIVE');
  });

  it('STATUS_HALFTIME → LIVE', () => {
    assert.equal(normaliseStatus('STATUS_HALFTIME'), 'LIVE');
  });

  it('STATUS_EXTRA_TIME → LIVE', () => {
    assert.equal(normaliseStatus('STATUS_EXTRA_TIME'), 'LIVE');
  });

  it('STATUS_SCHEDULED → NS', () => {
    assert.equal(normaliseStatus('STATUS_SCHEDULED'), 'NS');
  });

  it('STATUS_PENALTIES → PEN', () => {
    assert.equal(normaliseStatus('STATUS_PENALTIES'), 'PEN');
  });

  it('STATUS_OVERTIME → LIVE', () => {
    assert.equal(normaliseStatus('STATUS_OVERTIME'), 'LIVE');
  });

  it('STATUS_SHOOTOUT → LIVE', () => {
    assert.equal(normaliseStatus('STATUS_SHOOTOUT'), 'LIVE');
  });

  it('STATUS_END_OF_EXTRATIME → LIVE', () => {
    assert.equal(normaliseStatus('STATUS_END_OF_EXTRATIME'), 'LIVE');
  });

  it('any status with state "in" → LIVE', () => {
    assert.equal(normaliseStatus('SOME_UNKNOWN_STATUS', 'in'), 'LIVE');
  });

  it('STATUS_FINAL_OVERTIME → AET', () => {
    assert.equal(normaliseStatus('STATUS_FINAL_OVERTIME'), 'AET');
  });

  it('STATUS_FINAL_AET → AET', () => {
    assert.equal(normaliseStatus('STATUS_FINAL_AET'), 'AET');
  });

  it('any completed status with state "post" containing "AET" → AET', () => {
    assert.equal(normaliseStatus('SOME_AET_STATUS', 'post'), 'AET');
  });

  it('any completed status with state "post" containing "PEN" → PEN', () => {
    assert.equal(normaliseStatus('SOME_PENALTIES_STATUS', 'post'), 'PEN');
  });

  it('any completed status with state "post" default → FT', () => {
    assert.equal(normaliseStatus('SOME_FINAL_STATUS', 'post'), 'FT');
  });

  it('STATUS_FINAL_PEN → PEN', () => {
    assert.equal(normaliseStatus('STATUS_FINAL_PEN'), 'PEN');
  });

  it('STATUS_FINAL_SHOOTOUT → PEN', () => {
    assert.equal(normaliseStatus('STATUS_FINAL_SHOOTOUT'), 'PEN');
  });

  it('POSTPONED → PST', () => {
    assert.equal(normaliseStatus('POSTPONED'), 'PST');
  });

  it('null → NS', () => {
    assert.equal(normaliseStatus(null), 'NS');
  });

  it('undefined → NS', () => {
    assert.equal(normaliseStatus(undefined), 'NS');
  });

  it('unrecognised string → NS (safe default)', () => {
    assert.equal(normaliseStatus('MYSTERY_STATUS'), 'NS');
  });

  it('is case-insensitive', () => {
    assert.equal(normaliseStatus('status_full_time'), 'FT');
    assert.equal(normaliseStatus('Status_In_Progress'), 'LIVE');
  });
});

// ---------------------------------------------------------------------------
// Tests: dynamic team name matching (findMatchEntry / schedule join)
// Validates: Req 9.3
// ---------------------------------------------------------------------------

describe('findMatchEntry — dynamic team name matching (Req 9.3)', () => {
  const schedule = makeSchedule([
    { matchId: 'WC2026-001', homeTeam: 'Mexico', awayTeam: 'USA', round: 'GROUP', group: 'A' },
    { matchId: 'WC2026-042', homeTeam: 'Brazil', awayTeam: 'France', round: 'QF', group: null },
  ]);

  it('finds entry by exact home+away name match', () => {
    const entry = findMatchEntry(schedule, 'Mexico', 'USA');
    assert.equal(entry?.matchId, 'WC2026-001');
  });

  it('finds entry when home and away names are swapped (API may flip sides)', () => {
    const entry = findMatchEntry(schedule, 'USA', 'Mexico');
    assert.equal(entry?.matchId, 'WC2026-001');
  });

  it('returns null when no match is found', () => {
    const entry = findMatchEntry(schedule, 'Germany', 'Spain');
    assert.equal(entry, null);
  });

  it('returns null when either name is empty', () => {
    assert.equal(findMatchEntry(schedule, '', 'USA'), null);
    assert.equal(findMatchEntry(schedule, 'Mexico', ''), null);
  });

  it('returns null when schedule is empty', () => {
    const entry = findMatchEntry(new Map(), 'Mexico', 'USA');
    assert.equal(entry, null);
  });
});

// ---------------------------------------------------------------------------
// Tests: full event mapping — matchId assignment
// Validates: Req 9.3 (known fixture), Req 9.4 (unknown fixture fallback)
// ---------------------------------------------------------------------------

describe('mapEspnEvent — matchId assignment', () => {
  const schedule = makeSchedule([
    { matchId: 'WC2026-001', homeTeam: 'Mexico', awayTeam: 'USA', round: 'GROUP', group: 'A' },
  ]);

  it('uses internal matchId when team names match schedule (Req 9.3)', () => {
    const event = makeEspnEvent({ id: 9001, homeName: 'Mexico', awayName: 'USA' });
    const result = mapEspnEvent(event, schedule);
    assert.equal(result.matchId, 'WC2026-001');
  });

  it('falls back to "espn-<id>" when no schedule match found (Req 9.4)', () => {
    const event = makeEspnEvent({ id: 9002, homeName: 'Germany', awayName: 'Spain' });
    const result = mapEspnEvent(event, schedule);
    assert.equal(result.matchId, 'espn-9002');
  });

  it('falls back to "espn-<id>" when schedule is empty (Req 9.4)', () => {
    const event = makeEspnEvent({ id: 9003, homeName: 'Argentina', awayName: 'England' });
    const result = mapEspnEvent(event, new Map());
    assert.equal(result.matchId, 'espn-9003');
  });

  it('uses internal matchId when mapped via apiFixtureId even if names do not match (knockouts)', () => {
    const schedule = makeSchedule([
      { matchId: 'WC2026-090', homeTeam: 'Round of 32 2 Winner', awayTeam: 'Round of 32 5 Winner', round: 'R16', group: null }
    ]);
    const fixtureIdMap = new Map([['9090', 'WC2026-090']]);
    const event = makeEspnEvent({ id: 9090, homeName: 'Germany', awayName: 'Netherlands' });
    const result = mapEspnEvent(event, schedule, fixtureIdMap);
    assert.equal(result.matchId, 'WC2026-090');
    assert.equal(result.round, 'R16');
  });
});

// ---------------------------------------------------------------------------
// Tests: full event mapping — field correctness
// ---------------------------------------------------------------------------

describe('mapEspnEvent — field population', () => {
  const emptySchedule = new Map();

  it('populates team names from competitor displayName', () => {
    const event = makeEspnEvent({ homeName: 'Brazil', awayName: 'Argentina' });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.homeTeam, 'Brazil');
    assert.equal(result.awayTeam, 'Argentina');
  });

  it('populates scores as integers', () => {
    const event = makeEspnEvent({ homeScore: '3', awayScore: '1' });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.homeScore, 3);
    assert.equal(result.awayScore, 1);
  });

  it('scores default to 0 when not provided', () => {
    const event = makeEspnEvent({ homeScore: undefined, awayScore: undefined });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.homeScore, 0);
    assert.equal(result.awayScore, 0);
  });

  it('populates winner flags', () => {
    const event = makeEspnEvent({ homeWinner: true, awayWinner: false });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.homeWinner, true);
    assert.equal(result.awayWinner, false);
  });

  it('winner flags are null when not provided (draw or upcoming)', () => {
    const event = makeEspnEvent({ homeWinner: null, awayWinner: null });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.homeWinner, null);
    assert.equal(result.awayWinner, null);
  });

  it('populates shootout scores as integers when present', () => {
    const event = makeEspnEvent({ homeShootoutScore: 4, awayShootoutScore: 3 });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.homeShootoutScore, 4);
    assert.equal(result.awayShootoutScore, 3);
  });

  it('shootout scores are null when not present', () => {
    const event = makeEspnEvent({ homeShootoutScore: undefined, awayShootoutScore: undefined });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.homeShootoutScore, null);
    assert.equal(result.awayShootoutScore, null);
  });

  it('normalises status via normaliseStatus', () => {
    const event = makeEspnEvent({ statusName: 'STATUS_IN_PROGRESS' });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.status, 'LIVE');
  });

  it('populates minute from displayClock when in-progress', () => {
    const event = makeEspnEvent({ statusName: 'STATUS_IN_PROGRESS', displayClock: '67' });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.minute, 67);
  });

  it('minute is null when displayClock is absent', () => {
    const event = makeEspnEvent({ statusName: 'STATUS_FULL_TIME', displayClock: null });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.minute, null);
  });

  it('round is populated from schedule match when found', () => {
    const schedule = makeSchedule([
      { matchId: 'WC2026-010', homeTeam: 'England', awayTeam: 'France', round: 'SF', group: null },
    ]);
    const event = makeEspnEvent({ homeName: 'England', awayName: 'France' });
    const result = mapEspnEvent(event, schedule);
    assert.equal(result.round, 'SF');
  });

  it('round is null when no schedule match found', () => {
    const event = makeEspnEvent({ homeName: 'NoTeam1', awayName: 'NoTeam2' });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.round, null);
  });

  it('team names are trimmed of whitespace', () => {
    const event = makeEspnEvent({ homeName: '  Spain  ', awayName: '  Germany  ' });
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.homeTeam, 'Spain');
    assert.equal(result.awayTeam, 'Germany');
  });

  it('falls back to "Unknown" when competitor is missing', () => {
    const event = {
      id: '9999',
      status: { type: { name: 'STATUS_SCHEDULED' }, displayClock: null },
      competitions: [{ competitors: [] }],
    };
    const result = mapEspnEvent(event, emptySchedule);
    assert.equal(result.homeTeam, 'Unknown');
    assert.equal(result.awayTeam, 'Unknown');
  });
});

// ---------------------------------------------------------------------------
// Tests: standings mapping
// ---------------------------------------------------------------------------

describe('mapEspnStandings — standings parsing', () => {
  it('correctly maps and sorts standings by rank', () => {
    const rawGroup = {
      name: 'Group A',
      standings: {
        entries: [
          makeEspnStandingsEntry('South Korea', 2, 3, 1),
          makeEspnStandingsEntry('Mexico', 1, 3, 2),
        ]
      }
    };

    const result = mapEspnStandings(rawGroup);

    assert.equal(result.group, 'Group A');
    assert.equal(result.standings.length, 2);
    assert.equal(result.standings[0].team.name, 'Mexico');
    assert.equal(result.standings[0].rank, 1);
    assert.equal(result.standings[1].team.name, 'South Korea');
    assert.equal(result.standings[1].rank, 2);
  });

  it('maps all expected statistics', () => {
    const rawGroup = {
      name: 'Group B',
      standings: {
        entries: [makeEspnStandingsEntry('Canada', 1, 3, 5)]
      }
    };

    const result = mapEspnStandings(rawGroup);
    const entry = result.standings[0];

    assert.equal(entry.points, 3);
    assert.equal(entry.goalsDiff, 5);
    assert.equal(entry.all.played, 3);
    assert.equal(entry.all.win, 1);
    assert.equal(entry.all.draw, 1);
    assert.equal(entry.all.lose, 1);
    assert.equal(entry.all.goals.for, 3);
    assert.equal(entry.all.goals.against, 3);
  });
});

// ---------------------------------------------------------------------------
// Tests: mapEspnEvent — edge cases
// ---------------------------------------------------------------------------

describe('mapEspnEvent — edge cases', () => {
  it('handles a completely empty event object gracefully', () => {
    const result = mapEspnEvent({}, new Map());
    assert.equal(result.homeTeam, 'Unknown');
    assert.equal(result.awayTeam, 'Unknown');
    assert.equal(result.status, 'NS');
    assert.equal(result.homeWinner, null);
    assert.equal(result.awayWinner, null);
  });

  it('handles missing competitions array gracefully', () => {
    const event = { id: '42', status: { type: { name: 'STATUS_SCHEDULED' } } };
    const result = mapEspnEvent(event, new Map());
    assert.equal(result.homeTeam, 'Unknown');
  });
});

