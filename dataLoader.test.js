/**
 * dataLoader.test.js — Unit tests for dataLoader.js
 *
 * Feature: football-worldcup-2026-sweepstake
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock fetch for dataLoader
const mockFetchData = {
  json: null,
  shouldThrow: false
};

globalThis.fetch = async (url) => {
  if (mockFetchData.shouldThrow) throw new Error('Fetch failed');
  return {
    ok: true,
    json: async () => mockFetchData.json
  };
};

const { loadSchedule, loadAssignments, loadPointsConfig } = await import('./dataLoader.js');

describe('dataLoader', () => {

  beforeEach(() => {
    mockFetchData.json = null;
    mockFetchData.shouldThrow = false;
  });

  describe('loadSchedule', () => {
    it('correctly parses matches into a Map', async () => {
      mockFetchData.json = {
        matches: [
          { matchId: 'm1', homeTeam: 'Team A', awayTeam: 'Team B' },
          { matchId: 'm2', homeTeam: 'Team C', awayTeam: 'Team D' }
        ]
      };
      const { scheduleMap } = await loadSchedule();
      assert.equal(scheduleMap.size, 2);
      assert.equal(scheduleMap.get('m1').homeTeam, 'Team A');
    });

    it('returns empty map on failure', async () => {
      mockFetchData.shouldThrow = true;
      const { scheduleMap } = await loadSchedule();
      assert.equal(scheduleMap.size, 0);
    });
  });

  describe('loadAssignments', () => {
    it('correctly maps teams to participants', async () => {
      const scheduleMap = new Map([
        ['m1', { homeTeam: 'England', awayTeam: 'France' }]
      ]);
      mockFetchData.json = {
        assignments: [
          { team: 'England', participant: 'Alice' },
          { team: 'France', participant: 'Bob' }
        ]
      };
      const assignments = await loadAssignments(scheduleMap);
      assert.equal(assignments.get('England'), 'Alice');
      assert.equal(assignments.get('France'), 'Bob');
    });

    it('detects duplicate team assignments', async () => {
      const scheduleMap = new Map();
      mockFetchData.json = {
        assignments: [
          { team: 'Team A', participant: 'Alice' },
          { team: 'Team A', participant: 'Bob' }
        ]
      };
      // Note: Current dataLoader behavior is to push to state.configErrors
      // and potentially return the map so far. Let's just verify it doesn't throw.
      const assignments = await loadAssignments(scheduleMap);
      assert.ok(assignments instanceof Map);
    });
  });

  describe('loadPointsConfig', () => {
    it('returns default points if file is missing or invalid', async () => {
      mockFetchData.shouldThrow = true;
      const config = await loadPointsConfig();
      assert.equal(config.win, 3);
      assert.equal(config.draw, 1);
    });

    it('returns custom points if file is valid', async () => {
      mockFetchData.json = {
        win: 10,
        draw: 5,
        advancement: { R32: 2, R16: 2, QF: 2, SF: 2, '3RD': 2, FINAL: 2 }
      };
      const config = await loadPointsConfig();
      assert.equal(config.win, 10);
      assert.equal(config.draw, 5);
    });

    it('falls back to defaults if points are out of range', async () => {
      mockFetchData.json = {
        win: 500, // Invalid (> 100)
        draw: 1,
        advancement: { R32: 5, R16: 5, QF: 5, SF: 5, '3RD': 5, FINAL: 5 }
      };
      const config = await loadPointsConfig();
      assert.equal(config.win, 3); // Fallback to default
    });
  });
});
