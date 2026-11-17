import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import { useAudioPeaks, useIsMediaAdmin, useRefreshAfterReel } from './hooks';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  getMomentBackfill: vi.fn(),
  getAudioPeaks: vi.fn(),
}));

vi.mock('../hooks', () => ({
  debateQueryKeys: {
    extractedClaims: (id: string) => ['debates', 'extracted-claims', id],
    media: (id: string) => ['debates', 'media', id],
    transcripts: (id: string) => ['debates', 'transcript', id],
    momentReelPlan: (id: string, account: string | null) => ['debates', 'account', account, 'moment-reel-plan', id],
    mediaAdmin: (account: string | null) => ['debates', 'account', account, 'media-admin'],
    audioPeaks: (id: string, account: string | null) => ['debates', 'account', account, 'audio-peaks', id],
  },
  debateQueryNetworkOptions: { retry: false, refetchOnReconnect: false, refetchOnWindowFocus: false },
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    accountKey: 'account',
    getPrivyIdentityToken: async () => 'token',
  }),
}));

vi.mock('./api', () => ({
  getMomentBackfill: mocks.getMomentBackfill,
  getAudioPeaks: mocks.getAudioPeaks,
  postMomentBackfill: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.authenticated = true;
  mocks.getMomentBackfill.mockReset();
  mocks.getAudioPeaks.mockReset();
});

describe('useIsMediaAdmin (GEO-3671)', () => {
  it('is true once geo-chat answers its admin read', async () => {
    mocks.getMomentBackfill.mockResolvedValue({ request: null, entry: null });
    const { result } = renderHook(() => useIsMediaAdmin('debate', true), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it.each([
    ['off the allowlist', new GeoChatRequestError('no', 'media_admin_required', 403)],
    ['with no admins configured', new GeoChatRequestError('no', 'media_admin_not_configured', 503)],
  ])('is false for a viewer %s, and does not ask again', async (_, refusal) => {
    mocks.getMomentBackfill.mockRejectedValue(refusal);
    const { result } = renderHook(() => useIsMediaAdmin('debate', true), { wrapper });
    await waitFor(() => expect(mocks.getMomentBackfill).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(result.current).toBe(false);
    expect(mocks.getMomentBackfill).toHaveBeenCalledTimes(1);
  });

  // The feed asks on the active card only, so each debate scrolled to mounts or enables another
  // observer. A refusal kept as an error (no data) is stale whatever its staleTime, and each one
  // asked geo-chat again: one 403 per debate per non-admin.
  it('does not ask again for the next card once geo-chat has refused', async () => {
    mocks.getMomentBackfill.mockRejectedValue(new GeoChatRequestError('no', 'media_admin_required', 403));
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    const shared = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const first = renderHook(() => useIsMediaAdmin('debate-1', true), { wrapper: shared });
    await waitFor(() => expect(mocks.getMomentBackfill).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(first.result.current).toBe(false));
    first.unmount();

    const next = renderHook(({ active }) => useIsMediaAdmin('debate-2', active), {
      wrapper: shared,
      initialProps: { active: false },
    });
    next.rerender({ active: true });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(next.result.current).toBe(false);
    expect(mocks.getMomentBackfill).toHaveBeenCalledTimes(1);
  });

  it('is false while geo-chat cannot be reached', async () => {
    mocks.getMomentBackfill.mockRejectedValue(new GeoChatRequestError('down', null, 500));
    const { result } = renderHook(() => useIsMediaAdmin('debate', true), { wrapper });
    await waitFor(() => expect(mocks.getMomentBackfill).toHaveBeenCalledTimes(3));
    expect(result.current).toBe(false);
  });

  it('asks nothing signed out', () => {
    mocks.authenticated = false;
    const { result } = renderHook(() => useIsMediaAdmin('debate', true), { wrapper });
    expect(result.current).toBe(false);
    expect(mocks.getMomentBackfill).not.toHaveBeenCalled();
  });
});

describe('useRefreshAfterReel (GEO-3671)', () => {
  // A re-render moves the video, and the editor maps every live cut onto the player's clock through
  // the media's turns, and snaps and judges clips by the transcript's words, which a re-render that
  // re-extracts has changed: all are read again with the plan.
  it('reads the plan, the served moments, the media and the transcript again', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRefreshAfterReel('debate'), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    result.current();
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['debates', 'account', 'account', 'moment-reel-plan', 'debate'],
      ['debates', 'extracted-claims', 'debate'],
      ['debates', 'media', 'debate'],
      ['debates', 'transcript', 'debate'],
    ]);
  });
});

describe('useAudioPeaks (GEO-3673)', () => {
  const queued = (waiting = 3) => ({
    debate_id: 'debate',
    status: 'queued',
    requested_at: '2026-11-16T15:00:00Z',
    waiting_s: waiting,
    queue_position: 1,
  });
  const ready = {
    debate_id: 'debate',
    status: 'ready',
    clock: 'player',
    bucket_ms: 10,
    scale: 'dbfs_u8',
    floor_db: -60,
    lanes: [
      { participant_slot: 1, offset: 0, samples: 3 },
      { participant_slot: 2, offset: 3, samples: 3 },
    ],
    version: 'v1',
    data: btoa(String.fromCharCode(10, 200, 0, 50, 0, 255)),
  };

  afterEach(() => {
    // Unmounted first: a hook left polling would read the next test's answers.
    cleanup();
    vi.useRealTimers();
  });

  /** Lets React Query's timers and promises run `ms` on. */
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  it('reads the build every 5 s, then 15 s after two minutes, and stops at ten saying it is still waiting', async () => {
    vi.useFakeTimers();
    mocks.getAudioPeaks.mockResolvedValue(queued());
    const { result } = renderHook(() => useAudioPeaks('debate', true), { wrapper });
    await advance(0);
    expect(result.current).toEqual({ kind: 'waiting', message: 'Preparing the waveform… (waiting 0:03)' });
    expect(mocks.getAudioPeaks).toHaveBeenCalledTimes(1);

    await advance(5_000);
    expect(mocks.getAudioPeaks).toHaveBeenCalledTimes(2);
    // Two minutes in: 24 reads at 5 s, plus the first.
    await advance(115_000);
    expect(mocks.getAudioPeaks).toHaveBeenCalledTimes(25);
    // Backed off: the next read is 15 s after the last.
    await advance(14_000);
    expect(mocks.getAudioPeaks).toHaveBeenCalledTimes(25);
    await advance(1_000);
    expect(mocks.getAudioPeaks).toHaveBeenCalledTimes(26);

    await advance(8 * 60_000);
    expect(result.current).toMatchObject({ kind: 'gave-up' });
    const atGiveUp = mocks.getAudioPeaks.mock.calls.length;
    await advance(5 * 60_000);
    expect(mocks.getAudioPeaks).toHaveBeenCalledTimes(atGiveUp);
    expect(result.current).toMatchObject({
      kind: 'gave-up',
      message: expect.stringMatching(/^Still waiting for the media worker/),
    });
  });

  it('stops reading once the peaks are ready, and mixes the two lanes into one waveform', async () => {
    vi.useFakeTimers();
    mocks.getAudioPeaks.mockResolvedValueOnce(queued()).mockResolvedValue(ready);
    const { result } = renderHook(() => useAudioPeaks('debate', true), { wrapper });
    await advance(0);
    await advance(5_000);
    await advance(100);
    expect(result.current.kind).toBe('ready');
    if (result.current.kind !== 'ready') return;
    expect([...result.current.peaks.samples]).toEqual([50, 200, 255]);
    await advance(60_000);
    expect(mocks.getAudioPeaks).toHaveBeenCalledTimes(2);
  });

  // A geo-chat that predates the route answers 404: the editor works on, with no waveform.
  it('reads a missing route as no waveform, without asking again', async () => {
    mocks.getAudioPeaks.mockRejectedValue(new GeoChatRequestError('Not found', 'not_found', 404));
    const { result } = renderHook(() => useAudioPeaks('debate', true), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ kind: 'none', message: 'No waveform for this debate.' }));
    expect(mocks.getAudioPeaks).toHaveBeenCalledTimes(1);
  });

  it('shows no waveform when geo-chat fails, after its retries', async () => {
    mocks.getAudioPeaks.mockRejectedValue(new GeoChatRequestError('down', null, 500));
    const { result } = renderHook(() => useAudioPeaks('debate', true), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ kind: 'none', message: 'No waveform for this debate.' }));
    expect(mocks.getAudioPeaks).toHaveBeenCalledTimes(3);
  });

  it('says why an unavailable debate has none, and does not poll it', async () => {
    vi.useFakeTimers();
    mocks.getAudioPeaks.mockResolvedValue({ debate_id: 'debate', status: 'unavailable', reason: 'media_job_active' });
    const { result } = renderHook(() => useAudioPeaks('debate', true), { wrapper });
    await advance(0);
    expect(result.current).toMatchObject({ kind: 'none', message: expect.stringMatching(/still processing/) });
    await advance(60_000);
    expect(mocks.getAudioPeaks).toHaveBeenCalledTimes(1);
  });
});
