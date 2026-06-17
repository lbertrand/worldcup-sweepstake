/**
 * pollManager.js — Polling scheduler
 *
 * Polling only occurs when the tab is visible and matches are active.
 */

import { state } from './state.js';
import { CONFIG } from './config.js';

let intervalId = null;
let wakeUpTimeoutId = null;
let registeredFetchFn = null;

/**
 * Check whether any entry in results has status === "LIVE".
 */
function hasLiveMatches(results) {
  for (const match of results.values()) {
    if (match.status === 'LIVE') return true;
  }
  return false;
}

/**
 * Find the next scheduled match kickoff and set a wake-up timer.
 */
function scheduleWakeUp(schedule, results) {
  if (wakeUpTimeoutId) {
    clearTimeout(wakeUpTimeoutId);
    wakeUpTimeoutId = null;
  }

  const now = Date.now();
  let nearestKickoff = Infinity;

  for (const match of schedule.values()) {
    const kickoffTime = new Date(match.kickoff).getTime();
    const result = results.get(match.matchId);
    
    // Only consider matches that haven't started (NS) or aren't in results yet
    if (kickoffTime > now && (!result || result.status === 'NS')) {
      if (kickoffTime < nearestKickoff) {
        nearestKickoff = kickoffTime;
      }
    }
  }

  if (nearestKickoff !== Infinity) {
    // Wake up 5 minutes (300,000 ms) after the scheduled kickoff
    const delay = (nearestKickoff - now) + (5 * 60 * 1000);
    console.log(`[pollManager] Next game starts in ${Math.round((nearestKickoff - now) / 60000)} mins. Wake-up scheduled in ${Math.round(delay / 60000)} mins.`);
    
    wakeUpTimeoutId = setTimeout(async () => {
      console.log('[pollManager] Wake-up timer triggered. Fetching latest scores...');
      await registeredFetchFn();
      wakeUpTimeoutId = null;
    }, delay);
  }
}

/**
 * Evaluate whether polling should be active and start/stop accordingly.
 */
export function evaluatePolling() {
  const shouldPoll = !document.hidden && hasLiveMatches(state.results);

  if (shouldPoll && !intervalId) {
    intervalId = setInterval(registeredFetchFn, CONFIG.POLL_INTERVAL_MS);
  } else if (!shouldPoll && intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  // If we aren't polling, schedule a wake-up call for the next game
  if (!intervalId && !document.hidden) {
    scheduleWakeUp(state.schedule, state.results);
  }
}

/**
 * Start the poll manager.
 */
export function start(fetchFn) {
  registeredFetchFn = fetchFn;
  document.addEventListener('visibilitychange', evaluatePolling);
  evaluatePolling();
}

/**
 * Stop the poll manager.
 */
export function stop() {
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = null;
  document.removeEventListener('visibilitychange', evaluatePolling);
}
