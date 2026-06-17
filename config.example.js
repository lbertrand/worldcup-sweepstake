/**
 * config.example.js — Configuration template
 *
 * Copy this file to config.js.
 * config.js is excluded from version control (.gitignore).
 */

export const CONFIG = {
  /** 
   * ESPN Scoreboard API (No key required) 
   * Including the full date range of the tournament to ensure past scores are loaded.
   */
  ESPN_SCOREBOARD_FULL_URL: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260720&limit=200',

  /**
   * Polling interval.
   * Polled every 5 minutes while matches are live.
   */
  POLL_INTERVAL_MS: 5 * 60 * 1000,
};
