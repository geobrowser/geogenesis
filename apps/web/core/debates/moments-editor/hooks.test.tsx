import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import { useAudioPeaks, useIsMediaAdmin, useMomentsTranscript, useRefreshAfterReel } from './hooks';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  getMomentBackfill: vi.fn(),
  getAudioPeaks: vi.fn(),
  getMomentsTranscript: vi.fn(),
  getDebateTranscript: vi.fn(),
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  getDebateTranscript: mocks.getDebateTranscript,
}));

vi.mock('../hooks', () => ({
  debateQueryKeys: {
    extractedClaims: (id: string) => ['debates', 'extracted-claims', id],
    media: (id: string) => ['debates', 'media', id],
    transcripts: (id: string) => ['debates', 'transcript', id],
    momentsTranscript: (id: string, account: string | null) => ['debates', 'transcript', id, 'moments', account],
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
  getMomentsTranscript: mocks.getMomentsTranscript,
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
  mocks.getMomentsTranscript.mockReset();
  mocks.getDebateTranscript.mockReset();
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

describe('useMomentsTranscript (GEO-3642)', () => {
  const transcript = (backfill: Record<string, unknown> | null, words_from: string | null = null) => ({
    format: 'json',
    model_id: 'm',
    segments: [],
    word_timing: words_from !== null,
    words: [],
    sentences: [],
    words_from,
    backfill,
  });
  const queued = transcript({
    status: 'queued',
    requested_at: '2026-11-17T10:00:00Z',
    waiting_s: 3,
    queue_position: 1,
  });
  const ready = transcript({ status: 'ready', version: 'tv1', agreement: 0.9, agrees: true }, 'backfill');

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  it('reads a transcription every 15 s, then every minute after ten, for as long as it takes', async () => {
    vi.useFakeTimers();
    mocks.getMomentsTranscript.mockResolvedValue(queued);
    const { result } = renderHook(() => useMomentsTranscript('debate', true), { wrapper });
    await advance(0);
    expect(result.current.data).toEqual(queued);
    expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(1);
    expect(mocks.getMomentsTranscript).toHaveBeenCalledWith(
      'debate',
      expect.any(Function),
      'account',
      expect.anything()
    );

    await advance(15_000);
    expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(2);
    // Ten minutes in: 40 reads at 15 s, plus the first.
    await advance(585_000);
    expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(41);
    await advance(59_000);
    expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(41);
    await advance(1_000);
    expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(42);
    // Hours on, still read: geo-chat moves a stuck run on, not the editor.
    await advance(3 * 60 * 60_000);
    expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(42 + 180);
  });

  it('stops reading once the saved words are ready', async () => {
    vi.useFakeTimers();
    mocks.getMomentsTranscript.mockResolvedValueOnce(queued).mockResolvedValue(ready);
    const { result } = renderHook(() => useMomentsTranscript('debate', true), { wrapper });
    await advance(0);
    await advance(15_000);
    await advance(100);
    expect(result.current.data).toEqual(ready);
    await advance(10 * 60_000);
    expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(2);
  });

  // A re-render (or a `transcript_changed` refresh) queues a fresh transcription under ready words:
  // the new wait is read every 15 s again, not at the slow rate a long earlier wait reached.
  it('reads every 15 s again when ready words go back to being transcribed', async () => {
    vi.useFakeTimers();
    mocks.getMomentsTranscript.mockResolvedValue(queued);
    const client = new QueryClient();
    const shared = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({ transcript: useMomentsTranscript('debate', true), refresh: useRefreshAfterReel('debate') }),
      { wrapper: shared }
    );
    await advance(0);
    // Past the ten minutes, so this wait reads once a minute.
    await advance(11 * 60_000);
    mocks.getMomentsTranscript.mockResolvedValue(ready);
    await advance(61_000);
    expect(result.current.transcript.data).toEqual(ready);
    mocks.getMomentsTranscript.mockResolvedValue(queued);
    await act(async () => result.current.refresh());
    await advance(0);
    expect(result.current.transcript.data).toEqual(queued);
    const calls = mocks.getMomentsTranscript.mock.calls.length;
    await advance(15_000);
    expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(calls + 1);
  });

  // The copy for these says to reopen the editor: the reopen must ask geo-chat, not show the last answer.
  it.each([
    ['being transcribed', queued],
    ['failed', transcript({ status: 'failed', reason: 'download failed', permanent: false })],
    ['unavailable', transcript({ status: 'unavailable', reason: 'media_job_active' })],
  ])('asks again on the next open while %s, and keeps words', async (_, answer) => {
    const client = new QueryClient();
    const shared = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    mocks.getMomentsTranscript.mockResolvedValue(answer);
    const first = renderHook(() => useMomentsTranscript('debate', true), { wrapper: shared });
    await waitFor(() => expect(first.result.current.data).toEqual(answer));
    first.unmount();
    renderHook(() => useMomentsTranscript('debate', true), { wrapper: shared });
    await waitFor(() => expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(2));

    mocks.getMomentsTranscript.mockReset();
    const kept = new QueryClient();
    const keptWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={kept}>{children}</QueryClientProvider>
    );
    mocks.getMomentsTranscript.mockResolvedValue(ready);
    const words = renderHook(() => useMomentsTranscript('debate', true), { wrapper: keptWrapper });
    await waitFor(() => expect(words.result.current.data).toEqual(ready));
    words.unmount();
    const again = renderHook(() => useMomentsTranscript('debate', true), { wrapper: keptWrapper });
    await waitFor(() => expect(again.result.current.data).toEqual(ready));
    expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a geo-chat without the route', new GeoChatRequestError('Not found', 'not_found', 404)],
    ['a refusal of the admin route', new GeoChatRequestError('no', 'media_admin_required', 403)],
  ])('reads the public transcript, with words and sentences, from %s', async (_, error) => {
    const published = { format: 'json', model_id: 'm', segments: [], word_timing: false };
    mocks.getMomentsTranscript.mockRejectedValue(error);
    mocks.getDebateTranscript.mockResolvedValue(published);
    const { result } = renderHook(() => useMomentsTranscript('debate', true), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(published));
    expect(mocks.getDebateTranscript).toHaveBeenCalledWith(
      'debate',
      'json',
      expect.any(Function),
      'account',
      expect.anything(),
      ['words', 'sentences']
    );
    expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(1);
  });

  it('fails, without the public read, when geo-chat fails', async () => {
    mocks.getMomentsTranscript.mockRejectedValue(new GeoChatRequestError('down', null, 500));
    const { result } = renderHook(() => useMomentsTranscript('debate', true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.getDebateTranscript).not.toHaveBeenCalled();
  });

  // The refresh after a re-render or a `transcript_changed` refusal invalidates every transcript of
  // the debate by prefix: the editor's must be one of them.
  it('is read again by the refresh after a reel', async () => {
    mocks.getMomentsTranscript.mockResolvedValue(ready);
    const client = new QueryClient();
    const shared = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({ transcript: useMomentsTranscript('debate', true), refresh: useRefreshAfterReel('debate') }),
      { wrapper: shared }
    );
    await waitFor(() => expect(result.current.transcript.data).toEqual(ready));
    act(() => result.current.refresh());
    await waitFor(() => expect(mocks.getMomentsTranscript).toHaveBeenCalledTimes(2));
  });

  it('asks nothing signed out', () => {
    mocks.authenticated = false;
    renderHook(() => useMomentsTranscript('debate', true), { wrapper });
    expect(mocks.getMomentsTranscript).not.toHaveBeenCalled();
  });
});
