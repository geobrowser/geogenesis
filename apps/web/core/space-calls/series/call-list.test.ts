import { describe, expect, it } from 'vitest';

import type { SpaceCallSummary } from '../api';
import { type CallListItem, byStart, rowReminders, splitCallList } from './call-list';

const item = (over: Partial<CallListItem>): CallListItem => ({
  callId: 'c',
  name: 'Call',
  seriesId: null,
  seriesName: null,
  remindSeriesId: null,
  startsAt: '2026-11-02T17:00:00Z',
  endsAt: null,
  status: 'scheduled',
  headcount: 0,
  avatars: [],
  ...over,
});

const row = (over: Partial<SpaceCallSummary>): SpaceCallSummary => ({
  call_id: 'call1',
  name: 'Weekly',
  starts_at: '2026-11-02T17:00:00Z',
  started_by: null,
  hosts: [],
  headcount: 0,
  avatars: [],
  as_of: null,
  ...over,
});

describe('splitCallList', () => {
  it('splits live and scheduled rows, skipping other statuses', () => {
    const { live, upcoming } = splitCallList({
      calls: [
        row({ call_id: 'LIVE-1', status: 'live', headcount: 3, as_of: 'x' }),
        row({
          call_id: 'b',
          status: 'scheduled',
          starts_at: '2026-11-09T17:00:00Z',
          ends_at: '2026-11-09T18:00:00Z',
          series: { series_id: 'S-1', name: 'Crypto' },
        }),
        row({ call_id: 'a', status: 'scheduled', starts_at: '2026-11-02T17:00:00Z' }),
        row({ call_id: 'gone', status: 'ended' }),
      ],
    });
    expect(live.map(call => [call.callId, call.headcount])).toEqual([['live1', 3]]);
    expect(upcoming.map(call => call.callId)).toEqual(['a', 'b']);
    expect(upcoming[1]).toMatchObject({
      seriesId: 's1',
      seriesName: 'Crypto',
      remindSeriesId: 's1',
      endsAt: '2026-11-09T18:00:00Z',
    });
  });

  it('offers no series reminder on a one-off series row', () => {
    const series = (series_id: string, one_off: boolean) => ({
      series_id,
      name: 'Crypto',
      description: null,
      schedule: 'DTSTART:20261109T170000Z',
      one_off,
      next_call_id: null,
    });
    const { upcoming } = splitCallList({
      calls: [
        row({ call_id: 'once', status: 'scheduled', series: { series_id: 'S-1', name: 'Crypto' } }),
        row({ call_id: 'weekly', status: 'scheduled', series: { series_id: 'S-2', name: 'Crypto' } }),
      ],
      series: [series('s1', true), series('s2', false)],
    });
    expect(upcoming.map(call => [call.callId, call.seriesId, call.remindSeriesId])).toEqual([
      ['once', 's1', null],
      ['weekly', 's2', 's2'],
    ]);
  });

  it('reads a row from a geo-chat that predates status as live', () => {
    expect(splitCallList({ calls: [row({})] }).live).toHaveLength(1);
  });
});

describe('rowReminders', () => {
  it('reads both reminders, however ids are spelled, and none signed out', () => {
    const call = item({ callId: 'c1', seriesId: 's1' });
    expect(rowReminders({ reminded_call_ids: ['C-1'], reminded_series_ids: [] }, call)).toEqual({
      call: true,
      series: false,
    });
    expect(rowReminders({ reminded_call_ids: [], reminded_series_ids: ['S-1'] }, call)).toEqual({
      call: false,
      series: true,
    });
    expect(rowReminders(null, call)).toEqual({ call: false, series: false });
  });
});

describe('call list', () => {
  it('sorts soonest first with unreadable starts last', () => {
    const rows = [
      item({ callId: 'b', startsAt: '2026-11-03T17:00:00Z' }),
      item({ callId: 'x', startsAt: 'nope' }),
      item({ callId: 'a', startsAt: '2026-11-02T17:00:00Z' }),
    ];
    expect(rows.sort(byStart).map(row => row.callId)).toEqual(['a', 'b', 'x']);
  });
});
