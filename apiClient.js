/**
 * apiClient.js — Fetch wrapper for ESPN Scoreboard API
 *
 * It uses dynamic team name matching to join API results with the local schedule.
 */

import { CONFIG } from './config.js';
import { state } from './state.js';

/** Timeout for API requests in milliseconds. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Perform a fetch with timeout.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Map match status from ESPN/FD to internal status enum.
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

  // ESPN Statuses
  if (['STATUS_IN_PROGRESS', 'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF', 'STATUS_HALFTIME', 'STATUS_EXTRA_TIME', 'STATUS_OVERTIME', 'STATUS_SHOOTOUT', 'STATUS_END_OF_EXTRATIME', 'HT', '1H', '2H', 'ET'].includes(s)) return 'LIVE';
  if (['STATUS_FULL_TIME', 'STATUS_FINAL', 'FT', 'FINISHED'].includes(s)) return 'FT';
  if (['STATUS_SCHEDULED', 'NS', 'TIMED'].includes(s)) return 'NS';
  if (['AET', 'STATUS_FINAL_OVERTIME', 'STATUS_FINAL_AET'].includes(s)) return 'AET';
  if (['PEN', 'STATUS_PENALTIES', 'STATUS_FINAL_PEN', 'STATUS_FINAL_SHOOTOUT'].includes(s)) return 'PEN';
  if (['SUSP'].includes(s)) return 'SUSP';
  if (['PST', 'POSTPONED'].includes(s)) return 'PST';
  return 'NS';
}

/**
 * Find the internal schedule entry based on team names.
 */
function findMatchEntry(home, away) {
  if (!home || !away) return null;
  const h = home.trim();
  const a = away.trim();

  for (const match of state.schedule.values()) {
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
 * Fetch fixtures and scores from ESPN.
 */
export async function fetchFixtures(url) {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
    const data = await res.json();

    const events = Array.isArray(data?.events) ? data.events : [];
    const results = events.map(event => {
      const competition = event.competitions?.[0];
      const homeCompetitor = competition?.competitors?.find(c => c.homeAway === 'home');
      const awayCompetitor = competition?.competitors?.find(c => c.homeAway === 'away');

      const homeTeam = homeCompetitor?.team?.displayName || 'Unknown';
      const awayTeam = awayCompetitor?.team?.displayName || 'Unknown';

      const apiFixtureId = event.id ? event.id.toString() : null;
      const matchId = apiFixtureId ? state.fixtureIdMap?.get(apiFixtureId) : null;
      const matchEntry = matchId ? state.schedule.get(matchId) : findMatchEntry(homeTeam, awayTeam);

      return {
        matchId: matchEntry?.matchId || `espn-${event.id}`,
        homeTeam: homeTeam.trim(),
        awayTeam: awayTeam.trim(),
        homeScore: parseInt(homeCompetitor?.score) || 0,
        awayScore: parseInt(awayCompetitor?.score) || 0,
        homeWinner: homeCompetitor?.winner ?? null,
        awayWinner: awayCompetitor?.winner ?? null,
        homeShootoutScore: homeCompetitor?.shootoutScore !== undefined ? parseInt(homeCompetitor.shootoutScore) : null,
        awayShootoutScore: awayCompetitor?.shootoutScore !== undefined ? parseInt(awayCompetitor.shootoutScore) : null,
        status: normaliseStatus(event.status?.type?.name, event.status?.type?.state),
        round: matchEntry?.round || null,
        minute: event.status?.displayClock ? parseInt(event.status.displayClock) : null,
        fetchedAt: new Date(),
      };
    });

    state.hasConnectivityError = false;
    state.lastUpdated = new Date();
    return results;
  } catch (err) {
    console.error('[apiClient] ESPN fetch failed:', err);
    state.hasConnectivityError = true;
    return [];
  }
}

/**
 * Fetch standings from ESPN.
 */
export async function fetchStandings() {
  try {
    const res = await fetchWithTimeout(CONFIG.ESPN_STANDINGS_URL);
    if (!res.ok) throw new Error(`ESPN Standings HTTP ${res.status}`);
    const data = await res.json();

    const groups = data.children || [];
    const results = groups.map(group => {
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

      // Explicitly sort by the official rank provided by ESPN
      standingsEntries.sort((a, b) => a.rank - b.rank);

      return {
        group: group.name,
        standings: standingsEntries
      };
    });

    state.hasConnectivityError = false;
    return results;
  } catch (err) {
    console.error('[apiClient] ESPN Standings fetch failed:', err);
    return [];
  }
}
