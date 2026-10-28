import { describe, expect, it } from 'vitest';

import type { SpaceCallSummary, SpaceCallsResponse } from './api';
import { parseSpaceCallPatch, spaceCallsRefetch, withSpaceCallPatch } from './space-calls-patch';

function row(extra: Partial<SpaceCallSummary> & { as_of?: string } = {}): SpaceCallSummary & { as_of: string } {
  return {
    call_id: 'call1',
    name: 'Community call',
    started_at: '2026-10-23T15:00:02Z',
    started_by: null,
    hosts: [],
    headcount: 3,
    avatars: [],
    as_of: '2026-10-23T15:04:11.123456Z',
    ...extra,
  };
}

const list: SpaceCallsResponse = { space_id: 'space1', supported: true, viewer_can_start: true, calls: [row()] };

describe('parseSpaceCallPatch', () => {
  it('reads a row and refuses anything else', () => {
    const call = row({ headcount: 4 });
    expect(parseSpaceCallPatch({ status: 'live', as_of: call.as_of, call })).toEqual({
      status: 'live',
      as_of: call.as_of,
      call,
    });
    expect(parseSpaceCallPatch(undefined)).toBeNull();
    expect(parseSpaceCallPatch({ status: 'live', as_of: 'x', call: { call_id: 'call1' } })).toBeNull();
  });
});

describe('withSpaceCallPatch', () => {
  it('replaces the listed row with a newer one, by microseconds too', () => {
    const newer = row({ headcount: 7, as_of: '2026-10-23T15:04:11.123457Z' });
    expect(withSpaceCallPatch(list, { status: 'live', as_of: newer.as_of, call: newer }).calls).toEqual([newer]);
  });

  it('keeps the list for an older patch, and never adds a call', () => {
    const older = row({ headcount: 1, as_of: '2026-10-23T15:00:00Z' });
    expect(withSpaceCallPatch(list, { status: 'live', as_of: older.as_of, call: older })).toBe(list);
    const other = row({ call_id: 'call2', as_of: '2026-10-23T16:00:00Z' });
    expect(withSpaceCallPatch(list, { status: 'live', as_of: other.as_of, call: other })).toBe(list);
  });

  it('matches a row however its id is spelled', () => {
    const dashed = { ...list, calls: [row({ call_id: 'CALL-1' })] };
    const newer = row({ call_id: 'call1', headcount: 9, as_of: '2026-10-23T16:00:00Z' });
    expect(withSpaceCallPatch(dashed, { status: 'live', as_of: newer.as_of, call: newer }).calls[0]?.headcount).toBe(9);
  });

  it('patches a scheduled row never broadcast (GEO-3420)', () => {
    const scheduled = { ...list, calls: [{ ...row(), status: 'scheduled' as const, as_of: null }] };
    const opened = row({ status: 'live', as_of: '2026-10-23T16:00:00Z' });
    expect(withSpaceCallPatch(scheduled, { status: 'live', as_of: opened.as_of, call: opened }).calls).toEqual([
      opened,
    ]);
  });
});

describe('spaceCallsRefetch', () => {
  it.each([
    ['started', { list: true, past: false }],
    ['opened', { list: true, past: false }],
    ['schedule', { list: true, past: false }],
    ['agenda', { list: false, past: false }],
    ['ended', { list: true, past: true }],
    [undefined, { list: true, past: true }],
    ['something-new', { list: true, past: true }],
  ])('refetches for %s', (change, expected) => {
    expect(spaceCallsRefetch(change)).toEqual(expected);
  });
});
