/**
 * state.js — AppState singleton
 *
 * A plain JavaScript object (module-level singleton) holding all mutable
 * application state. Components read from it; only pointsEngine and
 * apiClient write to it.
 *
 * Consumers should import the named export and mutate fields directly:
 *   import { state } from './state.js';
 *
 * Field reference:
 *
 *   schedule            Map<matchId, ScheduleEntry>
 *     Full fixture list loaded once at startup from schedule.json.
 *     Key: internal matchId string (e.g. "WC2026-001").
 *
 *   fixtureIdMap        Map<apiFixtureId, matchId>
 *     Reverse-lookup built at startup to join API responses to internal IDs.
 *     Key: numeric apiFixtureId from schedule.json.
 *
 *   assignments         Map<teamCode, participantName>
 *     Colleague-to-team mapping loaded once from assignments.json.
 *     Key: FIFA team name string (must match schedule.json homeTeam/awayTeam).
 *
 *   pointsConfig        PointsConfig | null
 *     Points values for win/draw/advancement loaded from points.json.
 *     null until successfully loaded; Points Engine halts while null.
 *
 *   liveResults         Map<matchId, ApiMatchResult>
 *     Latest fixture data from the API, updated on every poll cycle.
 *     Key: internal matchId string.
 *
 *   standings           ApiStandingsGroup[]
 *     Raw /standings response from the API, updated on every poll cycle.
 *     Passed directly to the Tournament Matrix renderer.
 *
 *   scores              Map<participantName, number>
 *     Sweepstake scores recomputed by the Points Engine after every poll.
 *     Key: participant display name.
 *
 *   awardedEvents       Set<string>
 *     Deduplication keys preventing double-awarding of match events.
 *     Format: "${matchId}:${eventType}:${teamCode}"
 *     e.g. "WC2026-042:WIN:England" or "WC2026-042:ADVANCE_R16:England"
 *
 *   lastUpdated         Date | null
 *     Timestamp of the most recent successful API response.
 *     null until the first successful fetch.
 *
 *   hasConnectivityError  boolean
 *     true when the most recent API call failed; false otherwise.
 *     Drives the persistent connectivity error banner in the UI.
 *
 *   configErrors        string[]
 *     Non-fatal validation warnings collected during startup and polling.
 *     Displayed inline in the UI until resolved.
 */

/** @type {AppState} */
export const state = {
  // Loaded once at startup from static JSON files
  schedule: new Map(),
  fixtureIdMap: new Map(),
  assignments: new Map(),
  pointsConfig: null,

  // Updated on each API poll cycle
  results: new Map(),
  standings: [],

  // Computed by the Points Engine after each successful poll
  scores: new Map(),
  awardedEvents: new Set(),

  // UI status fields
  lastUpdated: null,
  hasConnectivityError: false,
  configErrors: [],
};
