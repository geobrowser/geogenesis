import { describe, expect, it } from 'vitest';

import type { SpaceCallSummary, SpaceCallsResponse } from './api';
import { SIGNED_OUT_SPACE_CALLS_POLL_MS, nextSpaceCallsRefetch, spaceCallsRefetchInterval } from './hooks';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const MIN = 60_000;
const POLL = SIGNED_OUT_SPACE_CALLS_POLL_MS;

function call(extra: Partial<SpaceCallSummary>): SpaceCallSummary {
  return {
    call_id: 'c1',
    name: 'Weekly',
    started_at: '2026-10-28T12:00:00Z',
    started_by: null,
    hosts: [],
    headcount: 0,
    avatars: [],
    as_of: null,
    ...extra,
  };
}

function list(calls: SpaceCallSummary[], supported = true): SpaceCallsResponse {
  return { space_id: 's', supported, viewer_can_start: null, calls };
}

describe('nextSpaceCallsRefetch', () => {
  it('never reads a space without calls again', () => {
    expect(nextSpaceCallsRefetch(undefined, NOW)).toBe(false);
    expect(nextSpaceCallsRefetch(list([], false), NOW)).toBe(false);
  });

  it('polls every 3 minutes, also while a call is live', () => {
    expect(POLL).toBe(3 * MIN);
    expect(nextSpaceCallsRefetch(list([]), NOW)).toBe(POLL);
    expect(nextSpaceCallsRefetch(list([call({})]), NOW)).toBe(POLL);
    const pastHold = call({ status: 'live', starts_at: '2026-10-28T11:00:00Z', ends_at: '2026-10-28T13:00:00Z' });
    expect(nextSpaceCallsRefetch(list([pastHold]), NOW)).toBe(POLL);
  });

  it('reads again just after a scheduled call opens, when that is sooner', () => {
    const calls = [
      call({ status: 'scheduled', opens_at: '2026-10-28T12:01:00Z' }),
      call({ status: 'scheduled', opens_at: '2026-10-28T12:02:00Z' }),
    ];
    expect(nextSpaceCallsRefetch(list(calls), NOW)).toBe(MIN + 2_000);
    expect(nextSpaceCallsRefetch(list([call({ status: 'scheduled', opens_at: '2026-10-28T13:00:00Z' })]), NOW)).toBe(
      POLL
    );
  });

  it('reads an overdue opening again in 30s', () => {
    expect(nextSpaceCallsRefetch(list([call({ status: 'scheduled', opens_at: '2026-10-28T11:59:00Z' })]), NOW)).toBe(
      30_000
    );
  });

  it('reads a scheduled live call again when its hold ends, when that is sooner', () => {
    const held = call({ status: 'live', starts_at: '2026-10-28T11:46:00Z', ends_at: '2026-10-28T13:00:00Z' });
    expect(nextSpaceCallsRefetch(list([held]), NOW)).toBe(MIN + 2_000);
  });
});

describe('spaceCallsRefetchInterval', () => {
  it('refetches only a live read, signed out', () => {
    expect(spaceCallsRefetchInterval({ authenticated: false, live: true }, list([]), NOW)).toBe(POLL);
    expect(spaceCallsRefetchInterval({ authenticated: false, live: false }, list([]), NOW)).toBe(false);
    expect(spaceCallsRefetchInterval({ authenticated: true, live: true }, list([]), NOW)).toBe(false);
  });
});
