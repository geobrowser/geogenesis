import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearDebateReturnDestination,
  consumeDebateReturnDestination,
  peekDebateReturnDestination,
  rememberDebateReturnDestination,
  rememberLobbyReturnDestination,
} from './debate-return-navigation';

beforeEach(() => {
  clearDebateReturnDestination();
});

afterEach(() => {
  clearDebateReturnDestination();
  vi.useRealTimers();
});

describe('debate return navigation', () => {
  it('returns to the captured internal page once', () => {
    rememberDebateReturnDestination('/space/my-space?tab=posts#latest');

    expect(consumeDebateReturnDestination()).toBe('/space/my-space?tab=posts#latest');
    expect(consumeDebateReturnDestination()).toBeNull();
  });

  it('preserves the original page across debate room and rematch routes', () => {
    rememberDebateReturnDestination('/space/my-space');
    rememberDebateReturnDestination('/space/claim-space/debates/debate-1');
    rememberDebateReturnDestination('/space/claim-space/debates/rematches/rematch-1');

    expect(consumeDebateReturnDestination()).toBe('/space/my-space');
  });

  it('returns to a lobby stepped out of, through the debate and rematch routes', () => {
    rememberDebateReturnDestination('/space/my-space');
    rememberLobbyReturnDestination('lobby1');
    rememberDebateReturnDestination('/debate/lobby1');
    rememberDebateReturnDestination('/space/claim-space/debates/rematches/rematch-1');

    expect(peekDebateReturnDestination()).toBe('/debate/lobby1');
    expect(consumeDebateReturnDestination()).toBe('/debate/lobby1');
    expect(peekDebateReturnDestination()).toBeNull();
  });

  // GEO-3337: a lobby can stop being the way back mid-flow; the page the flow opened from is kept.
  it('keeps the page the flow opened from behind a lobby, for when the lobby stops being the way back', () => {
    rememberDebateReturnDestination('/space/my-space');
    rememberLobbyReturnDestination('lobby1');
    rememberLobbyReturnDestination('lobby1');

    expect(consumeDebateReturnDestination({ lobbyId: null })).toBe('/space/my-space');
  });

  it('has nothing behind a lobby the flow started in', () => {
    rememberLobbyReturnDestination('lobby1');

    expect(consumeDebateReturnDestination({ lobbyId: null })).toBeNull();
  });

  it('still never returns to a room captured from the address bar', () => {
    rememberDebateReturnDestination('/debate/room1');

    expect(consumeDebateReturnDestination()).toBeNull();
  });

  it('allows the debates index to be the return page', () => {
    rememberDebateReturnDestination('/space/my-space/debates?tab=requests');

    expect(consumeDebateReturnDestination()).toBe('/space/my-space/debates?tab=requests');
  });

  it('replaces a stale destination when a new flow starts from another page', () => {
    rememberDebateReturnDestination('/space/first');
    rememberDebateReturnDestination('/space/second');

    expect(consumeDebateReturnDestination()).toBe('/space/second');
  });

  // A protocol-relative href is not an off-site redirect here — `new URL('//evil.com/x', base)`
  // reconstructs to the bare path `/x`, so without this guard the viewer would be sent to the
  // wrong *local* page rather than off the origin. Rejecting beats silently rewriting.
  it('rejects a protocol-relative destination rather than rewriting it to a local path', () => {
    rememberDebateReturnDestination('//evil.example/space/somewhere');

    expect(consumeDebateReturnDestination()).toBeNull();
  });

  it('rejects external and expired destinations', () => {
    rememberDebateReturnDestination('https://example.com/steal-me');
    expect(consumeDebateReturnDestination()).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T00:00:00Z'));
    rememberDebateReturnDestination('/space/my-space');
    vi.advanceTimersByTime(6 * 60 * 60 * 1_000 + 1);

    expect(consumeDebateReturnDestination()).toBeNull();
  });
});

describe('the last page outside the debates', () => {
  const key = 'geo.debates.last-page-outside';

  afterEach(() => {
    window.sessionStorage.removeItem(key);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  /** A fresh module, as a new document loads it; `navigation` is how the browser got there. */
  async function loadDocument(navigation?: 'navigate' | 'reload' | 'back_forward') {
    vi.resetModules();
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue(
      navigation ? ([{ type: navigation }] as unknown as PerformanceEntryList) : []
    );
    return import('./debate-return-navigation');
  }

  it('forgets a page from an earlier visit when the lobby is opened straight from outside the app', async () => {
    window.sessionStorage.setItem(key, '/space/s1/profile');
    const nav = await loadDocument('navigate');
    expect(nav.lastPageOutsideDebates()).toBeNull();
    // Forgotten, so a reload of this lobby does not bring it back either.
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it('keeps the page across a reload or Back into the lobby', async () => {
    window.sessionStorage.setItem(key, '/space/s1/profile');
    expect((await loadDocument('reload')).lastPageOutsideDebates()).toBe('/space/s1/profile');
    expect((await loadDocument('back_forward')).lastPageOutsideDebates()).toBe('/space/s1/profile');
  });

  it('uses a page recorded in this document, whatever loaded it', async () => {
    const nav = await loadDocument('navigate');
    nav.rememberLastPageOutsideDebates('/explore?tab=claims');
    expect(nav.lastPageOutsideDebates()).toBe('/explore?tab=claims');
  });
});
