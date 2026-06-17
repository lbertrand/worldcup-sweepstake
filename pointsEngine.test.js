/**
 * pointsEngine.test.js — Property-based and unit tests for the Points Engine
 *
 * Feature: football-worldcup-2026-sweepstake
 *
 * Uses Node.js built-in test runner (node:test) + fast-check for property tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { computeScores, sortLeaderboard, computeStandings } from './pointsEngine.js';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const DEFAULT_POINTS = {
  win: 3,
  draw: 1,
  advancement: { R32: 5, R16: 5, QF: 5, SF: 5, '3RD': 5, FINAL: 5 },
};

const FINISHED_STATUSES = ['FT', 'AET', 'PEN'];
const ROUNDS = ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'];

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A non-empty string identifier safe for use as participant / team name */
const nameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,15}$/).filter(s => s.trim().length > 0);

/** A valid finished match status */
const finishedStatusArb = fc.constantFrom(...FINISHED_STATUSES);

/** A knockout round */
const knockoutRoundArb = fc.constantFrom(...ROUNDS);

// ---------------------------------------------------------------------------
// Helper: build a single finished GROUP result with explicit outcome
// ---------------------------------------------------------------------------

function makeResult({ matchId = '1', status = 'FT', homeTeam, awayTeam, round = 'GROUP', homeWinner = null, awayWinner = null, homeScore = 0, awayScore = 0 }) {
  return { matchId, status, homeTeam, awayTeam, round, homeWinner, awayWinner, homeScore, awayScore };
}

// ---------------------------------------------------------------------------
// Property 1: Leaderboard descending sort order
// Feature: football-worldcup-2026-sweepstake, Property 1: Leaderboard descending sort order
// Validates: Requirements 1.2
// ---------------------------------------------------------------------------

describe('Property 1: Leaderboard descending sort order', () => {
  it('sortLeaderboard returns entries in non-increasing score order', () => {
    fc.assert(
      fc.property(
        // Generate a score map: up to 20 unique names with scores 0-100
        fc.uniqueArray(nameArb, { minLength: 1, maxLength: 20 }).chain(names =>
          fc.record(
            Object.fromEntries(names.map(n => [n, fc.integer({ min: 0, max: 100 })]))
          ).map(obj => new Map(Object.entries(obj)))
        ),
        (scores) => {
          const sorted = sortLeaderboard(scores);
          for (let i = 1; i < sorted.length; i++) {
            assert.ok(
              sorted[i - 1][1] >= sorted[i][1],
              `Expected score at index ${i - 1} (${sorted[i - 1][1]}) >= score at index ${i} (${sorted[i][1]})`
            );
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Tied participants are alphabetically ordered
// Feature: football-worldcup-2026-sweepstake, Property 2: Tied participants are alphabetically ordered
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------

describe('Property 2: Tied participants are alphabetically ordered', () => {
  it('participants with equal scores are sorted alphabetically', () => {
    fc.assert(
      fc.property(
        // All participants share the same score
        fc.uniqueArray(nameArb, { minLength: 2, maxLength: 10 }).chain(names =>
          fc.integer({ min: 0, max: 100 }).map(sharedScore => {
            const scores = new Map(names.map(n => [n, sharedScore]));
            return { scores, sharedScore };
          })
        ),
        ({ scores }) => {
          const sorted = sortLeaderboard(scores);
          for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1][0];
            const curr = sorted[i][0];
            assert.ok(
              prev.localeCompare(curr) <= 0,
              `Expected "${prev}" to come before or equal "${curr}" alphabetically`
            );
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Win points are correctly awarded
// Feature: football-worldcup-2026-sweepstake, Property 3: Win points are correctly awarded
// Validates: Requirements 2.1
// ---------------------------------------------------------------------------

describe('Property 3: Win points are correctly awarded', () => {
  it('home team participant receives win points when homeWinner=true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }).map(String), // matchId
        nameArb, // homeTeam
        nameArb, // awayTeam
        nameArb, // homeParticipant
        nameArb, // awayParticipant
        finishedStatusArb,
        fc.integer({ min: 1, max: 10 }), // win points
        (matchId, homeTeam, awayTeam, homeParticipant, awayParticipant, status, winPts) => {
          fc.pre(homeTeam !== awayTeam);
          fc.pre(homeParticipant !== awayParticipant);

          const assignments = new Map([
            [homeTeam, homeParticipant],
            [awayTeam, awayParticipant],
          ]);
          const pointsConfig = { ...DEFAULT_POINTS, win: winPts };
          const result = makeResult({ matchId, status, homeTeam, awayTeam, homeWinner: true, awayWinner: false });

          const { scores } = computeScores([result], assignments, pointsConfig);

          assert.equal(
            scores.get(homeParticipant),
            winPts,
            `homeParticipant should get ${winPts} win points`
          );
          // Away participant gets 0 (loss)
          assert.equal(scores.get(awayParticipant) ?? 0, 0, 'awayParticipant should get 0 points');
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Draw points are correctly awarded
// Feature: football-worldcup-2026-sweepstake, Property 4: Draw points are correctly awarded
// Validates: Requirements 2.2
// ---------------------------------------------------------------------------

describe('Property 4: Draw points are correctly awarded', () => {
  it('both participants receive draw points when homeWinner and awayWinner are null', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }).map(String),
        nameArb, nameArb, nameArb, nameArb,
        finishedStatusArb,
        fc.integer({ min: 1, max: 10 }), // draw points
        (matchId, homeTeam, awayTeam, homeParticipant, awayParticipant, status, drawPts) => {
          fc.pre(homeTeam !== awayTeam);
          fc.pre(homeParticipant !== awayParticipant);

          const assignments = new Map([
            [homeTeam, homeParticipant],
            [awayTeam, awayParticipant],
          ]);
          const pointsConfig = { ...DEFAULT_POINTS, draw: drawPts };
          const result = makeResult({ matchId, status, homeTeam, awayTeam, homeWinner: null, awayWinner: null });

          const { scores } = computeScores([result], assignments, pointsConfig);

          assert.equal(scores.get(homeParticipant), drawPts, `homeParticipant should get ${drawPts} draw points`);
          assert.equal(scores.get(awayParticipant), drawPts, `awayParticipant should get ${drawPts} draw points`);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Advancement and match-result points are additive
// Feature: football-worldcup-2026-sweepstake, Property 5: Advancement and match-result points are additive
// Validates: Requirements 2.3
// ---------------------------------------------------------------------------

describe('Property 5: Advancement and match-result points are additive', () => {
  it('participant gets match-result points AND advancement points for knockout matches', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }).map(String),
        nameArb, nameArb, nameArb, nameArb,
        finishedStatusArb,
        knockoutRoundArb,
        fc.integer({ min: 1, max: 10 }), // win points
        fc.integer({ min: 1, max: 10 }), // advancement points
        (matchId, homeTeam, awayTeam, homeParticipant, awayParticipant, status, round, winPts, advPts) => {
          fc.pre(homeTeam !== awayTeam);
          fc.pre(homeParticipant !== awayParticipant);

          const assignments = new Map([
            [homeTeam, homeParticipant],
            [awayTeam, awayParticipant],
          ]);
          const advancementMap = Object.fromEntries(ROUNDS.map(r => [r, advPts]));
          const pointsConfig = { win: winPts, draw: 1, advancement: advancementMap };

          // homeWinner wins the knockout match
          const result = makeResult({ matchId, status, homeTeam, awayTeam, round, homeWinner: true, awayWinner: false });

          const { scores } = computeScores([result], assignments, pointsConfig);

          // Home participant: win + advancement
          assert.equal(
            scores.get(homeParticipant),
            winPts + advPts,
            `homeParticipant should get ${winPts} (win) + ${advPts} (advancement) = ${winPts + advPts}`
          );
          // Away participant: 0 (loss) + advancement
          assert.equal(
            scores.get(awayParticipant),
            advPts,
            `awayParticipant should get ${advPts} advancement points (lost but still participated in round)`
          );
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Deduplication idempotence
// Feature: football-worldcup-2026-sweepstake, Property 6: Deduplication idempotence
// Validates: Requirements 2.5
// ---------------------------------------------------------------------------

describe('Property 6: Deduplication idempotence', () => {
  it('calling computeScores twice with the same results gives identical scores', () => {
    fc.assert(
      fc.property(
        // Generate 1-5 finished GROUP results
        fc.array(
          fc.record({
            matchId: fc.integer({ min: 1, max: 50 }).map(String),
            status: finishedStatusArb,
            homeTeam: nameArb,
            awayTeam: nameArb,
            round: fc.constant('GROUP'),
            homeWinner: fc.constantFrom(true, false, null),
            awayWinner: fc.constantFrom(true, false, null),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.uniqueArray(nameArb, { minLength: 2, maxLength: 10 }),
        (results, participantNames) => {
          // Build a simple assignment: cycle participants over teams mentioned in results
          const teams = [...new Set(results.flatMap(r => [r.homeTeam, r.awayTeam]))];
          const assignments = new Map(
            teams.map((t, i) => [t, participantNames[i % participantNames.length]])
          );

          const { scores: scores1 } = computeScores(results, assignments, DEFAULT_POINTS);
          const { scores: scores2 } = computeScores([...results, ...results], assignments, DEFAULT_POINTS);

          // Scores must be identical despite doubled results
          for (const [participant, score] of scores1) {
            assert.equal(
              scores2.get(participant),
              score,
              `Participant "${participant}" score differs: ${score} vs ${scores2.get(participant)}`
            );
          }
          assert.equal(scores1.size, scores2.size, 'Score maps must have the same number of entries');
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Score correction consistency
// Feature: football-worldcup-2026-sweepstake, Property 7: Score correction consistency
// Validates: Requirements 2.4
// ---------------------------------------------------------------------------

describe('Property 7: Score correction consistency', () => {
  it('recomputing from corrected results gives corrected scores', () => {
    fc.assert(
      fc.property(
        nameArb, nameArb, nameArb, nameArb,
        fc.integer({ min: 1, max: 100000 }).map(String),
        finishedStatusArb,
        (homeTeam, awayTeam, homeParticipant, awayParticipant, matchId, status) => {
          fc.pre(homeTeam !== awayTeam);
          fc.pre(homeParticipant !== awayParticipant);

          const assignments = new Map([
            [homeTeam, homeParticipant],
            [awayTeam, awayParticipant],
          ]);

          // Initial result: home team wins
          const initialResult = makeResult({ matchId, status, homeTeam, awayTeam, homeWinner: true, awayWinner: false });
          const { scores: initialScores } = computeScores([initialResult], assignments, DEFAULT_POINTS);

          // Corrected result: draw instead
          const correctedResult = makeResult({ matchId, status, homeTeam, awayTeam, homeWinner: null, awayWinner: null });
          const { scores: correctedScores } = computeScores([correctedResult], assignments, DEFAULT_POINTS);

          // Initial: home gets win(3), away gets 0
          assert.equal(initialScores.get(homeParticipant), DEFAULT_POINTS.win);
          assert.equal(initialScores.get(awayParticipant) ?? 0, 0);

          // Corrected: both get draw(1)
          assert.equal(correctedScores.get(homeParticipant), DEFAULT_POINTS.draw);
          assert.equal(correctedScores.get(awayParticipant), DEFAULT_POINTS.draw);

          // They must differ (win != draw)
          assert.notEqual(
            initialScores.get(homeParticipant),
            correctedScores.get(homeParticipant),
            'Corrected score should differ from initial score'
          );
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Winner flag determines outcome unambiguously
// Feature: football-worldcup-2026-sweepstake, Property 8: Winner flag determines outcome unambiguously
// Validates: Requirements 2.1, 2.2
// ---------------------------------------------------------------------------

describe('Property 8: Winner flag determines outcome unambiguously', () => {
  it('homeWinner=true gives win to home only; null/null gives draw to both', () => {
    fc.assert(
      fc.property(
        nameArb, nameArb, nameArb, nameArb,
        fc.integer({ min: 1, max: 100000 }).map(String),
        finishedStatusArb,
        (homeTeam, awayTeam, homeParticipant, awayParticipant, matchId, status) => {
          fc.pre(homeTeam !== awayTeam);
          fc.pre(homeParticipant !== awayParticipant);

          const assignments = new Map([
            [homeTeam, homeParticipant],
            [awayTeam, awayParticipant],
          ]);

          // --- homeWinner=true case ---
          const winResult = makeResult({ matchId, status, homeTeam, awayTeam, homeWinner: true, awayWinner: false });
          const { scores: winScores } = computeScores([winResult], assignments, DEFAULT_POINTS);

          assert.equal(winScores.get(homeParticipant), DEFAULT_POINTS.win, 'home gets win pts');
          assert.equal(winScores.get(awayParticipant) ?? 0, 0, 'away gets 0 pts on home win');

          // --- null/null (draw) case --- uses a different matchId to avoid dedup interference
          const drawMatchId = matchId + '_draw';
          const drawResult = makeResult({ matchId: drawMatchId, status, homeTeam, awayTeam, homeWinner: null, awayWinner: null });
          const { scores: drawScores } = computeScores([drawResult], assignments, DEFAULT_POINTS);

          assert.equal(drawScores.get(homeParticipant), DEFAULT_POINTS.draw, 'home gets draw pts');
          assert.equal(drawScores.get(awayParticipant), DEFAULT_POINTS.draw, 'away gets draw pts');
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Unit test for unrecognised result type
// Validates: Requirements 2.6
// ---------------------------------------------------------------------------

describe('Unit test: unrecognised result status leaves scores unchanged', () => {
  it('computeScores skips results with unrecognised status', () => {
    const assignments = new Map([
      ['TeamA', 'Alice'],
      ['TeamB', 'Bob'],
    ]);

    const results = [
      makeResult({ matchId: '1', status: 'UNKNOWN', homeTeam: 'TeamA', awayTeam: 'TeamB', homeWinner: true, awayWinner: false }),
      makeResult({ matchId: '2', status: 'INVALID_STATUS', homeTeam: 'TeamA', awayTeam: 'TeamB', homeWinner: null, awayWinner: null }),
      makeResult({ matchId: '3', status: 'HALFTIME', homeTeam: 'TeamA', awayTeam: 'TeamB', homeWinner: true, awayWinner: false }),
    ];

    const { scores } = computeScores(results, assignments, DEFAULT_POINTS);

    // None of the results should have been processed — scores remain untouched
    assert.equal(scores.get('Alice') ?? 0, 0, 'Alice should have 0 points from unrecognised statuses');
    assert.equal(scores.get('Bob') ?? 0, 0, 'Bob should have 0 points from unrecognised statuses');
  });

  it('computeScores processes valid results alongside unrecognised ones', () => {
    const assignments = new Map([
      ['TeamA', 'Alice'],
      ['TeamB', 'Bob'],
    ]);

    const results = [
      makeResult({ matchId: '1', status: 'BOGUS', homeTeam: 'TeamA', awayTeam: 'TeamB', homeWinner: true, awayWinner: false }),
      makeResult({ matchId: '2', status: 'FT', homeTeam: 'TeamA', awayTeam: 'TeamB', homeWinner: true, awayWinner: false }),
    ];

    const { scores } = computeScores(results, assignments, DEFAULT_POINTS);

    // Only the FT result counts
    assert.equal(scores.get('Alice'), DEFAULT_POINTS.win, 'Alice should get win points from FT result only');
    assert.equal(scores.get('Bob') ?? 0, 0, 'Bob should have 0 points');
  });

  it('known non-finished statuses (NS, LIVE, SUSP, PST) also leave scores unchanged', () => {
    const assignments = new Map([
      ['TeamA', 'Alice'],
      ['TeamB', 'Bob'],
    ]);

    const nonFinishedStatuses = ['NS', 'LIVE', 'SUSP', 'PST'];
    for (const status of nonFinishedStatuses) {
      const results = [
        makeResult({ matchId: `m_${status}`, status, homeTeam: 'TeamA', awayTeam: 'TeamB', homeWinner: true, awayWinner: false }),
      ];
      const { scores } = computeScores(results, assignments, DEFAULT_POINTS);
      assert.equal(scores.get('Alice') ?? 0, 0, `Alice should have 0 points for status=${status}`);
      assert.equal(scores.get('Bob') ?? 0, 0, `Bob should have 0 points for status=${status}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests for computeStandings and FIFA tie-breaker rules
// ---------------------------------------------------------------------------

describe('computeStandings — FIFA tie-breaker rules', () => {
  const schedule = new Map([
    ['m1', { matchId: 'm1', homeTeam: 'Team A', awayTeam: 'Team B', group: 'A', round: 'GROUP' }],
    ['m2', { matchId: 'm2', homeTeam: 'Team C', awayTeam: 'Team D', group: 'A', round: 'GROUP' }],
    ['m3', { matchId: 'm3', homeTeam: 'Team A', awayTeam: 'Team C', group: 'A', round: 'GROUP' }],
    ['m4', { matchId: 'm4', homeTeam: 'Team B', awayTeam: 'Team D', group: 'A', round: 'GROUP' }],
    ['m5', { matchId: 'm5', homeTeam: 'Team A', awayTeam: 'Team D', group: 'A', round: 'GROUP' }],
    ['m6', { matchId: 'm6', homeTeam: 'Team B', awayTeam: 'Team C', group: 'A', round: 'GROUP' }],
  ]);

  it('ranks teams correctly based on points', () => {
    const results = [
      makeResult({ matchId: 'm1', homeTeam: 'Team A', awayTeam: 'Team B', homeWinner: true, homeScore: 2, awayScore: 0 }),
      makeResult({ matchId: 'm2', homeTeam: 'Team C', awayTeam: 'Team D', homeWinner: null, homeScore: 1, awayScore: 1 }),
    ];

    const standings = computeStandings(results, schedule);
    const groupA = standings[0].standings;

    assert.equal(groupA[0].team.name, 'Team A'); // 3 pts
    assert.equal(groupA[1].team.name, 'Team C'); // 1 pt
    assert.equal(groupA[2].team.name, 'Team D'); // 1 pt (alphabetical after C)
    assert.equal(groupA[3].team.name, 'Team B'); // 0 pts
  });

  it('applies Goal Difference tie-breaker', () => {
    const results = [
      makeResult({ matchId: 'm1', homeTeam: 'Team A', awayTeam: 'Team B', homeWinner: true, homeScore: 3, awayScore: 0 }),
      makeResult({ matchId: 'm2', homeTeam: 'Team C', awayTeam: 'Team D', homeWinner: true, homeScore: 1, awayScore: 0 }),
    ];

    const standings = computeStandings(results, schedule);
    const groupA = standings[0].standings;

    assert.equal(groupA[0].team.name, 'Team A'); // +3 GD
    assert.equal(groupA[1].team.name, 'Team C'); // +1 GD
  });

  it('applies Goals For tie-breaker', () => {
    const results = [
      makeResult({ matchId: 'm1', homeTeam: 'Team A', awayTeam: 'Team B', homeWinner: true, homeScore: 3, awayScore: 1 }), // GD +2, GF 3
      makeResult({ matchId: 'm2', homeTeam: 'Team C', awayTeam: 'Team D', homeWinner: true, homeScore: 2, awayScore: 0 }), // GD +2, GF 2
    ];

    const standings = computeStandings(results, schedule);
    const groupA = standings[0].standings;

    assert.equal(groupA[0].team.name, 'Team A');
    assert.equal(groupA[1].team.name, 'Team C');
  });

  it('applies Head-to-Head mini-group tie-breaker', () => {
    // Teams A, B, C all have 3 points, 0 GD, 1 GF overall
    // Match A vs B: A wins 1-0
    // Match B vs C: B wins 1-0
    // Match C vs A: C wins 1-0
    // Match D vs all: D loses everything
    const results = [
      makeResult({ matchId: 'm1', homeTeam: 'Team A', awayTeam: 'Team B', homeWinner: true, homeScore: 1, awayScore: 0 }),
      makeResult({ matchId: 'm6', homeTeam: 'Team B', awayTeam: 'Team C', homeWinner: true, homeScore: 1, awayScore: 0 }),
      makeResult({ matchId: 'm3', homeTeam: 'Team C', awayTeam: 'Team A', homeWinner: true, homeScore: 1, awayScore: 0 }),
      makeResult({ matchId: 'm5', homeTeam: 'Team A', awayTeam: 'Team D', homeWinner: null, homeScore: 0, awayScore: 0 }),
      makeResult({ matchId: 'm4', homeTeam: 'Team B', awayTeam: 'Team D', homeWinner: null, homeScore: 0, awayScore: 0 }),
      makeResult({ matchId: 'm2', homeTeam: 'Team C', awayTeam: 'Team D', homeWinner: null, homeScore: 0, awayScore: 0 }),
    ];

    const standings = computeStandings(results, schedule);
    const groupA = standings[0].standings;

    // A, B, C are tied on Pts, GD, GF overall
    // In mini-group A, B, C:
    // A: 3 pts (win vs B), 0 GD, 1 GF
    // B: 3 pts (win vs C), 0 GD, 1 GF
    // C: 3 pts (win vs A), 0 GD, 1 GF
    // They are STILL tied in the mini-group. Final fallback is alphabetical.
    assert.equal(groupA[0].team.name, 'Team A');
    assert.equal(groupA[1].team.name, 'Team B');
    assert.equal(groupA[2].team.name, 'Team C');
    assert.equal(groupA[3].team.name, 'Team D');
  });

  it('handles a clear Head-to-Head winner', () => {
    // Team A and B both played 1 game (against each other)
    // A wins 1-0. 
    // Results: A (3pts, +1GD), B (0pts, -1GD), C (0pts, 0GD), D (0pts, 0GD)
    // Order: A, C, D, B (C and D have better GD than B)
    const simpleResults = [
       makeResult({ matchId: 'm1', homeTeam: 'Team A', awayTeam: 'Team B', homeWinner: true, homeScore: 1, awayScore: 0 }),
    ];
    const standings = computeStandings(simpleResults, schedule);
    const groupA = standings[0].standings;
    
    assert.equal(groupA[0].team.name, 'Team A');
    assert.equal(groupA[1].team.name, 'Team C');
    assert.equal(groupA[2].team.name, 'Team D');
    assert.equal(groupA[3].team.name, 'Team B');
  });
});
