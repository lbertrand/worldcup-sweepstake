/**
 * dataLoader.js — Static JSON loader
 *
 * Loads and validates the three bundled JSON data files:
 *   - data/schedule.json    → Map<matchId, ScheduleEntry> + Map<apiFixtureId, matchId>
 *   - data/assignments.json → Map<teamCode, participantName>
 *   - data/points.json      → PointsConfig
 *
 * Validation errors are written to state.configErrors.
 * Fatal errors (missing file, bad JSON) set state.hasConnectivityError = true
 * and push a descriptive message to state.configErrors.
 */

import { state } from './state.js';

/** Default points config used when points.json fails validation. */
export const DEFAULT_POINTS_CONFIG = {
  win: 3,
  draw: 1,
  advancement: {
    R32: 5,
    R16: 5,
    QF: 5,
    SF: 5,
    '3RD': 5,
    FINAL: 5,
  },
};

/**
 * Fetch a JSON file and parse it. On 404 or parse error, records a fatal
 * error in state and throws so the caller can return a safe fallback.
 *
 * @param {string} url
 * @returns {Promise<unknown>}
 */
async function fetchJson(url) {
  let response;
  try {
    // Append a timestamp to the URL to bypass browser cache
    const cacheBuster = `t=${Date.now()}`;
    const urlWithCacheBuster = url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
    response = await fetch(urlWithCacheBuster);
  } catch (networkErr) {
    const msg = `Fatal: could not fetch "${url}" — ${networkErr.message}`;
    state.configErrors.push(msg);
    state.hasConnectivityError = true;
    throw new Error(msg);
  }

  if (!response.ok) {
    const msg = `Fatal: "${url}" returned HTTP ${response.status}`;
    state.configErrors.push(msg);
    state.hasConnectivityError = true;
    throw new Error(msg);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    const msg = `Fatal: failed to parse JSON from "${url}" — ${parseErr.message}`;
    state.configErrors.push(msg);
    state.hasConnectivityError = true;
    throw new Error(msg);
  }

  return data;
}

/**
 * Load and parse data/schedule.json.
 *
 * Builds:
 *   - scheduleMap:   Map<matchId, ScheduleEntry>
 *
 * On fatal error returns empty map (caller should check state.hasConnectivityError).
 *
 * @returns {Promise<{ scheduleMap: Map<string, object> }>}
 */
export async function loadSchedule() {
  let data;
  try {
    data = await fetchJson('data/schedule.json');
  } catch {
    return { scheduleMap: new Map(), fixtureIdMap: new Map() };
  }

  const scheduleMap = new Map();
  const fixtureIdMap = new Map();
  const matches = Array.isArray(data?.matches) ? data.matches : [];

  for (const match of matches) {
    scheduleMap.set(match.matchId, match);
    if (match.apiFixtureId) {
      fixtureIdMap.set(match.apiFixtureId.toString(), match.matchId);
    }
  }

  return { scheduleMap, fixtureIdMap };
}

/**
 * Load and parse assignments. Choice depends on URL ?mode=work parameter.
 *
 * @param {Map<string, object>} [scheduleMap]  Pass the scheduleMap from loadSchedule()
 *                                              to enable unknown-team detection.
 * @returns {Promise<Map<string, string>>}      Map<teamCode, participantName>
 */
export async function loadAssignments(scheduleMap) {
  let data;
  try {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const params = new URLSearchParams(search);
    const isWorkMode = params.get('mode') === 'work';
    const filename = isWorkMode ? 'data/assignments_work.json' : 'data/assignments_family.json';
    
    data = await fetchJson(filename);
  } catch {
    return new Map();
  }

  // Build a set of all known team names from the schedule for validation.
  const knownTeams = new Set();
  if (scheduleMap instanceof Map) {
    for (const entry of scheduleMap.values()) {
      if (entry.homeTeam) knownTeams.add(entry.homeTeam);
      if (entry.awayTeam) knownTeams.add(entry.awayTeam);
    }
  }

  const assignments = Array.isArray(data?.assignments) ? data.assignments : [];
  const assignmentMap = new Map();
  let hasDuplicates = false;

  for (const { team, participant } of assignments) {
    if (!team || !participant) continue;

    // Duplicate team check
    if (assignmentMap.has(team)) {
      state.configErrors.push(
        `Config error: team "${team}" is assigned to more than one participant ` +
        `("${assignmentMap.get(team)}" and "${participant}"). ` +
        `Fix the conflict in assignments.json. The Points Engine has been disabled.`
      );
      hasDuplicates = true;
      // Keep the first assignment; the duplicate is skipped.
      continue;
    }

    // Unknown team check (only when we have schedule data to compare against)
    if (knownTeams.size > 0 && !knownTeams.has(team)) {
      state.configErrors.push(
        `Config warning: team "${team}" in assignments.json is not present in schedule.json. ` +
        `This assignment will be ignored.`
      );
      // Do NOT add to map — the team name won't match any live result.
      continue;
    }

    assignmentMap.set(team, participant);
  }

  if (hasDuplicates) {
    state.engineDisabled = true;
  }

  return assignmentMap;
}

/**
 * Checks whether a value is a whole-number integer in [0, 100].
 * @param {unknown} v
 * @returns {boolean}
 */
function isValidPointsValue(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100;
}

/**
 * Load and parse data/points.json.
 *
 * Validation: every points value must be an integer in [0, 100].
 * If any value is invalid, records an error and falls back to DEFAULT_POINTS_CONFIG.
 *
 * @returns {Promise<object>}  PointsConfig
 */
export async function loadPointsConfig() {
  let data;
  try {
    data = await fetchJson('data/points.json');
  } catch {
    return { ...DEFAULT_POINTS_CONFIG, advancement: { ...DEFAULT_POINTS_CONFIG.advancement } };
  }

  const invalidEntries = [];

  // Validate top-level scalar values
  for (const key of ['win', 'draw']) {
    if (!isValidPointsValue(data[key])) {
      invalidEntries.push(`"${key}": ${JSON.stringify(data[key])}`);
    }
  }

  // Validate advancement sub-keys
  const ADVANCEMENT_KEYS = ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'];
  if (data.advancement && typeof data.advancement === 'object') {
    for (const key of ADVANCEMENT_KEYS) {
      const val = data.advancement[key];
      if (val !== undefined && !isValidPointsValue(val)) {
        invalidEntries.push(`"advancement.${key}": ${JSON.stringify(val)}`);
      }
    }
  }

  if (invalidEntries.length > 0) {
    state.configErrors.push(
      `Config error: points.json contains invalid value(s) — ${invalidEntries.join(', ')}. ` +
      `Values must be integers in [0, 100]. Falling back to default points (win: 3, draw: 1, advancement: 5).`
    );
    return { ...DEFAULT_POINTS_CONFIG, advancement: { ...DEFAULT_POINTS_CONFIG.advancement } };
  }

  // Merge: use defaults for any advancement keys absent in the file
  const advancement = { ...DEFAULT_POINTS_CONFIG.advancement };
  if (data.advancement && typeof data.advancement === 'object') {
    for (const key of ADVANCEMENT_KEYS) {
      if (data.advancement[key] !== undefined) {
        advancement[key] = data.advancement[key];
      }
    }
  }

  return {
    win: data.win,
    draw: data.draw,
    advancement,
  };
}
