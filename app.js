/**
 * app.js — Entry point
 *
 * Responsibilities:
 * - Initialise AppState
 * - Load all three JSON data files via dataLoader
 * - Register pollManager listeners
 * - Trigger the first API fetch cycle
 * - Wire the render cycle: any state mutation calls renderAll()
 * - Wire the manual refresh button to fetchAndUpdate()
 */

import { state } from './state.js';
import { loadSchedule, loadAssignments, loadPointsConfig } from './dataLoader.js';
import { fetchFixtures, fetchStandings } from './apiClient.js';
import { computeScores, computeStandings } from './pointsEngine.js';
import { start as startPolling, evaluatePolling } from './pollManager.js';
import { render as renderLeaderboard } from './ui/leaderboard.js';
import { render as renderTicker } from './ui/matchTicker.js';
import { render as renderMatrix } from './ui/tournamentMatrix.js';

import { CONFIG } from './config.js';

/**
 * Fetch scores from ESPN and update state.
 * @param {boolean} isInitialLoad - If true, fetch full history; if false, fetch today only.
 */
export async function fetchScoresAndUpdate(isInitialLoad = false) {
  const url = isInitialLoad ? CONFIG.ESPN_SCOREBOARD_FULL_URL : CONFIG.ESPN_SCOREBOARD_TODAY_URL;
  
  const [fixtures, officialStandings] = await Promise.all([
    fetchFixtures(url),
    fetchStandings()
  ]);
  
  // Merge new fixtures into the global results map
  for (const fixture of fixtures) {
    state.results.set(fixture.matchId, fixture);
  }

  // Pass all known results to the stateless computation engines
  const allResults = Array.from(state.results.values());

  // Calculate scores
  if (!state.engineDisabled && state.pointsConfig) {
    const { scores, awardedEvents } = computeScores(
      allResults,
      state.assignments,
      state.pointsConfig
    );
    state.scores = scores;
    state.awardedEvents = awardedEvents;
  }

  // Use official standings if available, otherwise fallback to local calculation
  if (officialStandings && officialStandings.length > 0) {
    state.standings = officialStandings;
  } else {
    state.standings = computeStandings(allResults, state.schedule);
  }

  evaluatePolling();
  renderAll();
}

/**
 * Unified update for manual refresh and initial load.
 */
export async function fetchAndUpdate(isInitialLoad = false) {
  await fetchScoresAndUpdate(isInitialLoad);
}

function getRelativeTimeString(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hr ago';
  if (diffHours < 24) return `${diffHours} hrs ago`;

  return date.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Re-render all UI components from current state.
 */
export function renderAll() {
  renderLeaderboard(state.scores, state.assignments);
  renderTicker(state.schedule, state.results, state.assignments);
  renderMatrix(state.standings, state.results, state.schedule, state.assignments);

  const lastUpdatedEl = document.getElementById('last-updated');
  if (lastUpdatedEl && state.lastUpdated instanceof Date) {
    lastUpdatedEl.textContent = `Updated ${getRelativeTimeString(state.lastUpdated)}`;
  }

  const connectivityBanner = document.getElementById('connectivity-banner');
  if (connectivityBanner) {
    connectivityBanner.hidden = !state.hasConnectivityError;
  }

  const configBanner = document.getElementById('config-banner');
  const configErrorsList = document.getElementById('config-errors');
  if (configBanner && configErrorsList) {
    if (state.configErrors.length > 0) {
      configErrorsList.innerHTML = '';
      for (const msg of state.configErrors) {
        const li = document.createElement('li');
        li.textContent = msg;
        configErrorsList.appendChild(li);
      }
      configBanner.hidden = false;
    } else {
      configBanner.hidden = true;
    }
  }
}

/**
 * Application entry point.
 */
export async function init() {
  const { scheduleMap, fixtureIdMap } = await loadSchedule();
  state.schedule = scheduleMap;
  state.fixtureIdMap = fixtureIdMap;

  const [assignments, pointsConfig] = await Promise.all([
    loadAssignments(scheduleMap),
    loadPointsConfig(),
  ]);

  state.assignments = assignments;
  state.pointsConfig = pointsConfig;

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => fetchAndUpdate(false));
  }

  startPolling(() => fetchScoresAndUpdate(false));
  
  // Re-render UI every minute just to keep relative times ('just now', '1 min ago') updated
  setInterval(renderAll, 60000);

  renderAll();
  await fetchAndUpdate(true);
}

document.addEventListener('DOMContentLoaded', () => init());
