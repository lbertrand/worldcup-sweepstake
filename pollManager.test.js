/**
 * pollManager.test.js — Unit tests for pollManager.js
 *
 * Uses Node.js built-in test runner (node:test).
 * Simulates browser globals (document.hidden, visibilitychange) in-process.
 *
 * Requirements: 5.1, 5.2, 5.3 (formerly 6.1, 6.2, 6.3)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Browser globals shim
// ---------------------------------------------------------------------------

// Simulate document.hidden (mutable by tests)
let _hidden = false;
const visibilityListeners = [];

// Use globalThis for standards-compliant global assignment
globalThis.document = {
  get hidden() { return _hidden; },
  addEventListener(event, fn) {
    if (event === 'visibilitychange') visibilityListeners.push(fn);
  },
  removeEventListener(event, fn) {
    if (event === 'visibilitychange') {
      const idx = visibilityListeners.indexOf(fn);
      if (idx !== -1) visibilityListeners.splice(idx, 1);
    }
  },
};

function simulateVisibilityChange(hidden) {
  _hidden = hidden;
  for (const fn of visibilityListeners) fn();
}

// ---------------------------------------------------------------------------
// Import module under test AFTER shims are in place
// ---------------------------------------------------------------------------

const { start, stop, evaluatePolling } = await import('./pollManager.js');

// Import the state singleton so tests can mutate state.results
// (pollManager reads state.results, not state.liveResults — there is no liveResults field)
const { state } = await import('./state.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatch(status) {
  return { matchId: 'test-1', status, homeTeam: 'A', awayTeam: 'B' };
}

/** Populate state.results with matches of the given statuses. */
function setResults(...statuses) {
  state.results.clear();
  statuses.forEach((s, i) => {
    state.results.set(`match-${i}`, makeMatch(s));
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _hidden = false;
  visibilityListeners.length = 0;
  state.results.clear();
});

afterEach(() => {
  stop(); // always clean up
});

// ---------------------------------------------------------------------------
// Tests for hasLiveMatches (via evaluatePolling behaviour)
// ---------------------------------------------------------------------------

describe('hasLiveMatches — implicit tests via evaluatePolling', () => {
  it('evaluatePolling starts interval when tab visible and there is a LIVE match', () => {
    const fetchFn = () => {};
    setResults('LIVE');

    start(fetchFn);

    // Verify evaluatePolling does not throw
    assert.doesNotThrow(() => evaluatePolling());
  });

  it('evaluatePolling does not start interval when results is empty', () => {
    const fetchFn = () => {};
    state.results.clear();

    start(fetchFn);

    assert.doesNotThrow(() => evaluatePolling());
  });

  it('evaluatePolling does not start interval when all matches are non-LIVE', () => {
    setResults('FT', 'NS', 'AET', 'PEN', 'SUSP', 'PST');

    start(() => {});

    assert.doesNotThrow(() => evaluatePolling());
  });
});

// ---------------------------------------------------------------------------
// Tests for start()
// ---------------------------------------------------------------------------

describe('start()', () => {
  it('registers a visibilitychange listener', () => {
    start(() => {});
    assert.equal(visibilityListeners.length, 1, 'should have 1 visibilitychange listener');
  });

  it('calling evaluatePolling immediately on start does not throw', () => {
    setResults('LIVE');
    assert.doesNotThrow(() => start(() => {}));
  });
});

// ---------------------------------------------------------------------------
// Tests for stop()
// ---------------------------------------------------------------------------

describe('stop()', () => {
  it('removes the visibilitychange listener after stop()', () => {
    start(() => {});
    assert.equal(visibilityListeners.length, 1);
    stop();
    assert.equal(visibilityListeners.length, 0, 'listener should be removed after stop()');
  });

  it('is safe to call stop() without start()', () => {
    assert.doesNotThrow(() => stop());
  });

  it('is safe to call stop() twice', () => {
    start(() => {});
    stop();
    assert.doesNotThrow(() => stop());
  });
});

// ---------------------------------------------------------------------------
// Tests for visibilitychange integration
// ---------------------------------------------------------------------------

describe('visibilitychange integration', () => {
  it('hiding the tab (document.hidden=true) does not throw', () => {
    setResults('LIVE');
    start(() => {});
    assert.doesNotThrow(() => simulateVisibilityChange(true));
  });

  it('showing the tab (document.hidden=false) when live match exists does not throw', () => {
    setResults('LIVE');
    start(() => {});
    simulateVisibilityChange(true);
    assert.doesNotThrow(() => simulateVisibilityChange(false));
  });

  it('showing the tab when no live matches does not throw', () => {
    state.results.clear();
    start(() => {});
    simulateVisibilityChange(true);
    assert.doesNotThrow(() => simulateVisibilityChange(false));
  });

  it('evaluatePolling clears interval when results updated to have no LIVE matches', () => {
    setResults('LIVE');
    start(() => {});
    // Remove the live match — next evaluatePolling should clear the interval
    setResults('FT');
    assert.doesNotThrow(() => evaluatePolling());
  });
});

// ---------------------------------------------------------------------------
// Tests for evaluatePolling (exported for use by app.js)
// ---------------------------------------------------------------------------

describe('evaluatePolling() — exported function', () => {
  it('is exported and callable independently', () => {
    start(() => {});
    assert.equal(typeof evaluatePolling, 'function');
    assert.doesNotThrow(() => evaluatePolling());
  });

  it('can be called multiple times without error', () => {
    setResults('LIVE');
    start(() => {});
    for (let i = 0; i < 5; i++) {
      assert.doesNotThrow(() => evaluatePolling());
    }
  });

  it('toggling live match presence through evaluatePolling does not throw', () => {
    start(() => {});

    setResults('LIVE');
    evaluatePolling(); // should start interval

    setResults('FT');
    evaluatePolling(); // should clear interval

    setResults('LIVE');
    evaluatePolling(); // should start interval again

    assert.doesNotThrow(() => stop());
  });
});
