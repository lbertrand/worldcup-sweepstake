/**
 * pointsEngine.js — Sweepstake score computation
 *
 * Pure functions that take state inputs and return new score maps.
 * No side effects, no DOM access, no module-level state.
 *
 * Algorithm (computeScores):
 * - Iterates over results with status ∈ {FT, AET, PEN}
 * - Determines win/draw from homeWinner/awayWinner booleans (no goal arithmetic)
 * - Awards win, draw, or 0 points per match
 * - Awards advancement points to both teams in any non-GROUP round
 * - Uses dedup key "${matchId}:${eventType}:${teamCode}" via awardedEvents Set
 * - Skips and warns on unrecognised status values
 *
 * Dedup key event types: WIN, DRAW, LOSS, ADVANCE_R32, ADVANCE_R16,
 *   ADVANCE_QF, ADVANCE_SF, ADVANCE_3RD, ADVANCE_FINAL
 */

/** Match statuses that represent a completed result. */
export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);

/** All recognised match statuses (used to detect unrecognised ones and warn). */
const ALL_KNOWN_STATUSES = new Set(['NS', 'LIVE', 'FT', 'AET', 'PEN', 'SUSP', 'PST']);

/**
 * Compute sweepstake scores from a full set of fixture results.
 * Recomputes from scratch on every call (handles corrections automatically).
 *
 * @param {ApiMatchResult[]} results
 * @param {Map<string, string>} assignments - teamCode → participantName
 * @param {PointsConfig} pointsConfig
 * @returns {{ scores: Map<string, number>, awardedEvents: Set<string> }}
 */
export function computeScores(results, assignments, pointsConfig) {
  /** @type {Map<string, number>} */
  const scores = new Map();
  /** @type {Set<string>} */
  const awardedEvents = new Set();

  /**
   * Award points to the participant assigned to a team, with deduplication.
   *
   * @param {string} team - team code / name
   * @param {string} eventType - e.g. "WIN", "DRAW", "LOSS", "ADVANCE_R16"
   * @param {string} matchId
   * @param {number} points
   */
  function award(team, eventType, matchId, points) {
    const key = `${matchId}:${eventType}:${team}`;
    if (awardedEvents.has(key)) return;
    awardedEvents.add(key);

    const participant = assignments.get(team);
    if (participant) {
      scores.set(participant, (scores.get(participant) ?? 0) + points);
    }
  }

  for (const result of results) {
    const { status } = result;

    // Warn and skip unrecognised statuses
    if (!ALL_KNOWN_STATUSES.has(status)) {
      console.warn(
        `pointsEngine: unrecognised match status "${status}" for match ${result.matchId} — skipping`
      );
      continue;
    }

    // Only process finished matches
    if (!FINISHED_STATUSES.has(status)) {
      continue;
    }

    const { matchId, homeTeam, awayTeam, homeWinner, awayWinner, round } = result;

    // Determine outcome from winner flags — no goal arithmetic needed
    if (homeWinner === true) {
      award(homeTeam, 'WIN',  matchId, pointsConfig.win);
      award(awayTeam, 'LOSS', matchId, 0);
    } else if (awayWinner === true) {
      award(awayTeam, 'WIN',  matchId, pointsConfig.win);
      award(homeTeam, 'LOSS', matchId, 0);
    } else {
      // Both winner flags are null/false → draw
      award(homeTeam, 'DRAW', matchId, pointsConfig.draw);
      award(awayTeam, 'DRAW', matchId, pointsConfig.draw);
    }

    // Advancement points: both teams playing a knockout match have reached that round
    if (round && round !== 'GROUP') {
      const advancementPoints = pointsConfig.advancement[round];
      if (advancementPoints !== undefined) {
        award(homeTeam, `ADVANCE_${round}`, matchId, advancementPoints);
        award(awayTeam, `ADVANCE_${round}`, matchId, advancementPoints);
      }
    }
  }

  return { scores, awardedEvents };
}

/**
 * Calculate group standings from match results.
 * 
 * @param {ApiMatchResult[]} results 
 * @param {Map<string, object>} schedule 
 * @returns {ApiStandingsGroup[]}
 */
export function computeStandings(results, schedule) {
  const groups = new Map(); // "A" -> Map<teamName, Stats>

  // 1. Initialize all teams from schedule
  for (const match of schedule.values()) {
    if (match.group) {
      if (!groups.has(match.group)) groups.set(match.group, new Map());
      const groupMap = groups.get(match.group);
      if (!groupMap.has(match.homeTeam)) groupMap.set(match.homeTeam, createEmptyStats(match.homeTeam));
      if (!groupMap.has(match.awayTeam)) groupMap.set(match.awayTeam, createEmptyStats(match.awayTeam));
    }
  }

  // 2. Process results
  for (const result of results) {
    const match = schedule.get(result.matchId);
    if (!match || !match.group || !FINISHED_STATUSES.has(result.status)) continue;

    const groupMap = groups.get(match.group);
    const home = groupMap.get(result.homeTeam);
    const away = groupMap.get(result.awayTeam);

    if (home && away) {
      home.played++;
      away.played++;
      home.goalsFor += result.homeScore;
      home.goalsAgainst += result.awayScore;
      away.goalsFor += result.awayScore;
      away.goalsAgainst += result.homeScore;

      if (result.homeWinner) {
        home.win++;
        away.lose++;
        home.points += 3;
      } else if (result.awayWinner) {
        away.win++;
        home.lose++;
        away.points += 3;
      } else {
        home.draw++;
        away.draw++;
        home.points += 1;
        away.points += 1;
      }
    }
  }

  // 3. Convert to ApiStandingsGroup format and sort
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, teamMap]) => {
      const groupResults = results.filter(r => {
        const m = schedule.get(r.matchId);
        return m && m.group === letter && FINISHED_STATUSES.has(r.status);
      });

      let standings = Array.from(teamMap.values()).map(s => ({
        ...s,
        goalsDiff: s.goalsFor - s.goalsAgainst,
        all: { 
          played: s.played, win: s.win, draw: s.draw, lose: s.lose, 
          goals: { for: s.goalsFor, against: s.goalsAgainst } 
        }
      }));

      // Pass 1: Primary FIFA Sort (Points > Goal Difference > Goals For)
      standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalsDiff !== a.goalsDiff) return b.goalsDiff - a.goalsDiff;
        return b.goalsFor - a.goalsFor;
      });

      // Pass 2: Resolve multi-team ties using Head-to-Head mini-groups
      const finalStandings = [];
      let i = 0;
      while (i < standings.length) {
        const current = standings[i];
        const tiedTeams = [current];
        let j = i + 1;
        while (j < standings.length && 
               standings[j].points === current.points && 
               standings[j].goalsDiff === current.goalsDiff && 
               standings[j].goalsFor === current.goalsFor) {
          tiedTeams.push(standings[j]);
          j++;
        }

        if (tiedTeams.length === 1) {
          finalStandings.push(current);
        } else {
          // Compute mini-group stats for tied teams
          const tiedNames = new Set(tiedTeams.map(t => t.team.name));
          const miniStats = new Map(tiedTeams.map(t => [t.team.name, { pts: 0, gd: 0, gf: 0 }]));

          for (const r of groupResults) {
            if (tiedNames.has(r.homeTeam) && tiedNames.has(r.awayTeam)) {
              const hStats = miniStats.get(r.homeTeam);
              const aStats = miniStats.get(r.awayTeam);
              
              hStats.gf += r.homeScore;
              hStats.gd += (r.homeScore - r.awayScore);
              aStats.gf += r.awayScore;
              aStats.gd += (r.awayScore - r.homeScore);

              if (r.homeWinner) hStats.pts += 3;
              else if (r.awayWinner) aStats.pts += 3;
              else { hStats.pts += 1; aStats.pts += 1; }
            }
          }

          // Sort tied teams based on mini-group stats, fallback to alphabetical
          tiedTeams.sort((a, b) => {
            const statsA = miniStats.get(a.team.name);
            const statsB = miniStats.get(b.team.name);
            if (statsB.pts !== statsA.pts) return statsB.pts - statsA.pts;
            if (statsB.gd !== statsA.gd) return statsB.gd - statsA.gd;
            if (statsB.gf !== statsA.gf) return statsB.gf - statsA.gf;
            return a.team.name.localeCompare(b.team.name);
          });

          finalStandings.push(...tiedTeams);
        }
        i = j;
      }

      standings = finalStandings.map((s, idx) => ({ ...s, rank: idx + 1 }));

      return { group: `Group ${letter}`, standings };
    });
}

function createEmptyStats(name) {
  return {
    team: { name },
    played: 0, win: 0, draw: 0, lose: 0,
    goalsFor: 0, goalsAgainst: 0, points: 0
  };
}

/**
 * Sort leaderboard entries descending by score, with alphabetical tiebreak.
 * Participants with the same score share the same rank number.
 *
 * @param {Map<string, number>} scores - participantName → score
 * @returns {Array<[string, number]>} sorted [name, score] pairs
 */
export function sortLeaderboard(scores) {
  return [...scores.entries()]
    .sort(([nameA, scoreA], [nameB, scoreB]) => {
      if (scoreB !== scoreA) return scoreB - scoreA;   // descending by score
      return nameA.localeCompare(nameB);                // ascending alphabetical tiebreak
    });
}
