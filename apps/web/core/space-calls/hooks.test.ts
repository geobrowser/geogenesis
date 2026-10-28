import { describe, expect, it } from 'vitest';

import type { SpaceCallSummary, SpaceCallsResponse } from './api';
import { nextSpaceCallsRefetch, spaceCallsRefetchInterval } from './hooks';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const MIN = 60_000;

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
  it('waits for nothing on a space without calls, or with none due', () => {
    expect(nextSpaceCallsRefetch(undefined, NOW)).toBe(false);
    expect(nextSpaceCallsRefetch(list([], false), NOW)).toBe(false);
    expect(nextSpaceCallsRefetch(list([]), NOW)).toBe(false);
  });

  it('reads again just after the soonest scheduled call opens', () => {
    const calls = [
      call({ status: 'scheduled', opens_at: '2026-10-28T13:00:00Z' }),
      call({ status: 'scheduled', opens_at: '2026-10-28T12:20:00Z' }),
    ];
    expect(nextSpaceCallsRefetch(list(calls), NOW)).toBe(20 * MIN + 2_000);
  });

  it('reads an overdue opening again in 30s, and caps a far one', () => {
    expect(nextSpaceCallsRefetch(list([call({ status: 'scheduled', opens_at: '2026-10-28T11:59:00Z' })]), NOW)).toBe(
      30_000
    );
    expect(nextSpaceCallsRefetch(list([call({ status: 'scheduled', opens_at: '2027-01-01T00:00:00Z' })]), NOW)).toBe(
      6 * 60 * MIN
    );
  });

  it('reads a scheduled live call again when its hold ends', () => {
    const held = call({ status: 'live', starts_at: '2026-10-28T12:10:00Z', ends_at: '2026-10-28T13:00:00Z' });
    expect(nextSpaceCallsRefetch(list([held]), NOW)).toBe(25 * MIN + 2_000);
  });

  it('reads any other live call again every idle window', () => {
    expect(nextSpaceCallsRefetch(list([call({})]), NOW)).toBe(15 * MIN + 2_000);
    const pastHold = call({ status: 'live', starts_at: '2026-10-28T11:00:00Z', ends_at: '2026-10-28T13:00:00Z' });
    expect(nextSpaceCallsRefetch(list([pastHold]), NOW)).toBe(15 * MIN + 2_000);
  });
});

describe('spaceCallsRefetchInterval', () => {
  const due = list([call({})]);

  it('refetches only a live read, signed out', () => {
    expect(spaceCallsRefetchInterval({ authenticated: false, live: true }, due, NOW)).toBe(15 * MIN + 2_000);
    expect(spaceCallsRefetchInterval({ authenticated: false, live: false }, due, NOW)).toBe(false);
    expect(spaceCallsRefetchInterval({ authenticated: true, live: true }, due, NOW)).toBe(false);
  });
});
