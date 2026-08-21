import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearDebateReturnDestination,
  consumeDebateReturnDestination,
  rememberDebateReturnDestination,
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
