import { renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';

const mocks = vi.hoisted(() => ({ outcome: 'executed', refresh: vi.fn() }));

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ accountKey: 'user-a', getPrivyIdentityToken: vi.fn() }),
}));
vi.mock('./schedule-outcome', () => ({ readScheduleOutcome: async () => mocks.outcome }));
vi.mock('../api', () => ({ refreshCallSeries: (...args: unknown[]) => mocks.refresh(...args) }));

const { useAfterSeriesPublish } = await import('./after-publish');

afterEach(() => {
  mocks.outcome = 'executed';
  mocks.refresh.mockReset();
});

const publish = { seriesId: 'series1', proposalId: 'p1', schedule: 'DTSTART:20261103T170000Z' };

describe('useAfterSeriesPublish', () => {
  it('opens the Calls tab with the note after a refresh', async () => {
    mocks.refresh.mockResolvedValue({ pending: false, series: [] });
    const { result } = renderHook(() => useAfterSeriesPublish('space1'));
    expect(await result.current(publish)).toMatch(/^\/space\/space1\/calls\?scheduled=series1&outcome=executed/);
  });

  it('keeps the note when a refresh fails for another reason', async () => {
    mocks.refresh.mockRejectedValue(new GeoChatRequestError('down', 'graph_unavailable', 503));
    const { result } = renderHook(() => useAfterSeriesPublish('space1'));
    expect(await result.current(publish)).toContain('outcome=executed');
  });

  it.each([403, 503])('opens the Calls tab without the note when scheduled calls are off (%i)', async status => {
    mocks.refresh.mockRejectedValue(new GeoChatRequestError('no', 'call_series_disabled', status));
    const { result } = renderHook(() => useAfterSeriesPublish('space1'));
    expect(await result.current(publish)).toBe('/space/space1/calls');
  });

  it('does not refresh a proposal waiting on governance', async () => {
    mocks.outcome = 'pending';
    const { result } = renderHook(() => useAfterSeriesPublish('space1'));
    expect(await result.current(publish)).toContain('outcome=pending');
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
