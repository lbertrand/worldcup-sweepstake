/**
 * config.js — Configuration
 *
 * This file is excluded from version control (.gitignore).
 */

export const CONFIG = {
  /** 
   * ESPN Scoreboard API (No key required) 
   * Full tournament range for initial load
   */
  ESPN_SCOREBOARD_FULL_URL: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260720&limit=200',

  /**
   * ESPN Scoreboard API for today's live matches
   */
  ESPN_SCOREBOARD_TODAY_URL: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',

  /**
   * ESPN Standings API (No key required)
   */
  ESPN_STANDINGS_URL: 'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=2026',

  /**
   * Polling interval.
   * Polled every 5 minutes while matches are live.
   */
  POLL_INTERVAL_MS: 5 * 60 * 1000,
};
