import '@testing-library/jest-dom/vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PastCall } from './api';

const mocks = vi.hoisted(() => ({
  calls: undefined as PastCall[] | undefined,
  enabled: [] as boolean[],
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  fetchNextPage: vi.fn(),
}));

vi.mock('./hooks', () => ({
  usePastCalls: (enabled: boolean) => {
    mocks.enabled.push(enabled);
    return {
      data: enabled ? mocks.calls : undefined,
      hasNextPage: mocks.hasNextPage,
      isFetchingNextPage: mocks.isFetchingNextPage,
      isFetchNextPageError: mocks.isFetchNextPageError,
      fetchNextPage: mocks.fetchNextPage,
    };
  },
}));
vi.mock('./call-recording-player', () => ({
  CallRecordingPlayer: ({ callId, preload, signOnPlay }: { callId: string; preload: string; signOnPlay?: boolean }) => (
    <div data-testid="player" data-preload={preload} data-sign-on-play={String(signOnPlay)}>
      {callId}
    </div>
  ),
}));

const { PastCallCard, pastCallDateLabel, pastCallDurationLabel } = await import('./past-call-card');
const { usePastCallInterleave } = await import('./explore-past-calls');

afterEach(() => {
  cleanup();
  mocks.calls = undefined;
  mocks.enabled = [];
  mocks.hasNextPage = false;
  mocks.isFetchingNextPage = false;
  mocks.isFetchNextPageError = false;
  mocks.fetchNextPage.mockReset();
});

const CALL: PastCall = {
  call_id: 'call1',
  space_id: 'space1',
  space_name: 'Crypto',
  name: 'Weekly community call',
  starts_at: '2026-10-23T15:00:02Z',
  ended_at: '2026-10-23T16:31:40Z',
  duration_seconds: 5498,
  started_by: null,
  recording: { duration_seconds: 5310.4, thumbnail_url: 'https://t/thumb.jpg', thumbnail_expires_at: null },
};

describe('PastCallCard', () => {
  it('shows the space, title, date and a player that fetches nothing until played', () => {
    render(<PastCallCard call={CALL} />);
    expect(screen.getByRole('link', { name: 'Crypto' })).toHaveAttribute('href', expect.stringContaining('space1'));
    expect(screen.getByRole('link', { name: 'Weekly community call' })).toHaveAttribute(
      'href',
      '/space/space1/calls/call1'
    );
    expect(screen.getByText(/Community call · Oct 23, 2026 · 1h 29m/)).toBeInTheDocument();
    expect(screen.getByTestId('player')).toHaveAttribute('data-preload', 'none');
    expect(screen.getByTestId('player')).toHaveAttribute('data-sign-on-play', 'true');
  });
});

describe('labels', () => {
  it('formats dates and durations, and drops what is unknown', () => {
    expect(pastCallDateLabel('nope')).toBeNull();
    expect(pastCallDurationLabel(null)).toBeNull();
    expect(pastCallDurationLabel(0)).toBeNull();
    expect(pastCallDurationLabel(20)).toBe('1m');
    expect(pastCallDurationLabel(45 * 60)).toBe('45m');
    expect(pastCallDurationLabel(2 * 3600)).toBe('2h 0m');
  });
});

describe('usePastCallInterleave', () => {
  it('reads and draws nothing with the flag off', () => {
    mocks.calls = [CALL];
    const { result } = renderHook(() => usePastCallInterleave(false));
    expect(result.current).toBeUndefined();
    expect(mocks.enabled.every(enabled => !enabled)).toBe(true);
  });

  it('leaves the feed alone while the list loads, fails or is empty', () => {
    const { result, rerender } = renderHook(() => usePastCallInterleave(true));
    expect(result.current).toBeUndefined();
    mocks.calls = [];
    rerender();
    expect(result.current).toBeUndefined();
  });

  it('places the calls between the cards', () => {
    mocks.calls = [CALL, { ...CALL, call_id: 'call2' }];
    const { result } = renderHook(() => usePastCallInterleave(true));
    const cards = result.current!(30);
    expect([...cards.keys()]).toEqual([3, 13]);
    expect(React.isValidElement(cards.get(3))).toBe(true);
  });

  const drawCards = (
    feedLength: number,
    interleave: ((n: number) => ReadonlyMap<number, React.ReactNode>) | undefined
  ) => render(<>{[...interleave!(feedLength).values()]}</>);

  it('loads the next page once the feed reaches the last loaded call', () => {
    mocks.calls = [CALL, { ...CALL, call_id: 'call2' }];
    mocks.hasNextPage = true;
    const { result } = renderHook(() => usePastCallInterleave(true));

    drawCards(10, result.current);
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
    cleanup();

    drawCards(30, result.current);
    expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('keeps earlier calls in their slots when a page arrives', () => {
    mocks.calls = [CALL, { ...CALL, call_id: 'call2' }];
    const { result, rerender } = renderHook(() => usePastCallInterleave(true));
    const before = [...result.current!(100).keys()];
    mocks.calls = [...mocks.calls, { ...CALL, call_id: 'call3' }];
    rerender();
    expect([...result.current!(100).keys()]).toEqual([...before, 23]);
  });

  it('stops at the last page, while a page loads, and after a page fails', () => {
    mocks.calls = [CALL];
    for (const state of [
      { hasNextPage: false },
      { hasNextPage: true, isFetchingNextPage: true },
      { hasNextPage: true, isFetchNextPageError: true },
    ]) {
      Object.assign(mocks, { hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false }, state);
      const { result, unmount } = renderHook(() => usePastCallInterleave(true));
      drawCards(30, result.current);
      unmount();
      cleanup();
    }
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });
});
