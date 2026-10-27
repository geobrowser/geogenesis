import { act, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Debate, GeoChatRequestError } from '~/core/debates/api';

import { PREVIEW_URL_REFRESH_LEAD_MS, previewSyncCorrection, useDebatePreviewClips } from './use-debate-preview-clips';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('~/core/debates/hooks', () => ({
  useRecordingPlaybackUrl: () => ({ lookup: mocks.lookup, refresh: mocks.refresh }),
}));

type Ready = { preview?: boolean; startedAtMs?: number; previewStart?: number };

function debateFixture(slot1: Ready, slot2: Ready): Debate {
  const recording = (slot: 1 | 2, ready: Ready) => ({
    participant_slot: slot,
    filename: `slot${slot}.webm`,
    started_at_ms: ready.startedAtMs ?? 1_700_000_000_000,
    ...(ready.preview === undefined ? {} : { preview_ready: ready.preview }),
    ...(ready.previewStart === undefined ? {} : { preview_start_seconds: ready.previewStart }),
  });
  return { id: 'debate-1', recordings: [recording(1, slot1), recording(2, slot2)] } as unknown as Debate;
}

const signed = ({ filename }: { filename: string }) =>
  Promise.resolve({
    url: `https://videodelivery.test/${filename}/downloads/clip.mp4`,
    hls_url: `https://videodelivery.test/${filename}/manifest/video.m3u8`,
    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  });

describe('useDebatePreviewClips', () => {
  beforeEach(() => {
    mocks.lookup.mockReset().mockImplementation(signed);
    mocks.refresh.mockReset().mockImplementation(signed);
  });
  afterEach(() => vi.useRealTimers());

  it('signs nothing and offers no clips with the flag off', async () => {
    const { result } = renderHook(() =>
      useDebatePreviewClips(debateFixture({ preview: true }, { preview: true }), true, { streamEnabled: false })
    );
    await Promise.resolve();

    expect(result.current.available).toBe(false);
    expect(result.current.clips).toEqual({ slot1: null, slot2: null });
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it('signs the preview variant of both slots once the card is near the viewport, and not before', async () => {
    const debate = debateFixture({ preview: true }, { preview: true });
    const { result, rerender } = renderHook(
      ({ near }: { near: boolean }) => useDebatePreviewClips(debate, near, { streamEnabled: true }),
      { initialProps: { near: false } }
    );
    await Promise.resolve();
    // Known from the debate alone, so the card holds the same way before and after signing.
    expect(result.current.available).toBe(true);
    expect(mocks.lookup).not.toHaveBeenCalled();

    rerender({ near: true });
    await waitFor(() => expect(result.current.clips.slot2).not.toBeNull());

    expect(mocks.lookup.mock.calls.map(([request]) => request)).toStrictEqual([
      { debateId: 'debate-1', filename: 'slot1.webm', variant: 'preview' },
      { debateId: 'debate-1', filename: 'slot2.webm', variant: 'preview' },
    ]);
    expect(result.current.clips).toEqual({
      slot1: 'https://videodelivery.test/slot1.webm/downloads/clip.mp4',
      slot2: 'https://videodelivery.test/slot2.webm/downloads/clip.mp4',
    });
  });

  it('signs only the slot whose clip is ready; the other stays null for its still', async () => {
    const { result } = renderHook(() =>
      useDebatePreviewClips(debateFixture({ preview: false }, { preview: true }), true, { streamEnabled: true })
    );
    await waitFor(() => expect(result.current.clips.slot2).not.toBeNull());

    expect(result.current.available).toBe(true);
    expect(result.current.clips.slot1).toBeNull();
    expect(mocks.lookup.mock.calls.map(([request]) => request)).toStrictEqual([
      { debateId: 'debate-1', filename: 'slot2.webm', variant: 'preview' },
    ]);
  });

  it('leaves a slot null when its clip cannot be signed, and does not ask again', async () => {
    mocks.lookup.mockImplementation(({ filename }: { filename: string }) =>
      filename === 'slot1.webm'
        ? Promise.reject(new GeoChatRequestError('no', 'stream_not_configured', 503))
        : signed({ filename })
    );
    const { result } = renderHook(() =>
      useDebatePreviewClips(debateFixture({ preview: true }, { preview: true }), true, { streamEnabled: true })
    );
    await waitFor(() => expect(result.current.clips.slot2).not.toBeNull());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.clips.slot1).toBeNull();
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });

  it('re-signs ahead of expires_at', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const expiresInMs = 10 * 60_000;
    mocks.lookup.mockImplementation(({ filename }: { filename: string }) =>
      Promise.resolve({
        url: `https://clip.test/${filename}?v=1`,
        expires_at: new Date(Date.now() + expiresInMs).toISOString(),
      })
    );
    mocks.refresh.mockImplementation(({ filename }: { filename: string }) =>
      Promise.resolve({ url: `https://clip.test/${filename}?v=2` })
    );
    const { result } = renderHook(() =>
      useDebatePreviewClips(debateFixture({ preview: true }, { preview: false }), true, { streamEnabled: true })
    );
    await waitFor(() => expect(result.current.clips.slot1).toBe('https://clip.test/slot1.webm?v=1'));
    expect(mocks.refresh).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(expiresInMs - PREVIEW_URL_REFRESH_LEAD_MS + 10);
    });

    await waitFor(() => expect(result.current.clips.slot1).toBe('https://clip.test/slot1.webm?v=2'));
    expect(mocks.refresh.mock.calls.map(([request]) => request)).toStrictEqual([
      { debateId: 'debate-1', filename: 'slot1.webm', variant: 'preview' },
    ]);
  });

  it('re-signs once when the clip element fails, then gives the slot up to its still', async () => {
    mocks.refresh.mockImplementation(({ filename }: { filename: string }) =>
      Promise.resolve({ url: `https://clip.test/${filename}?fresh` })
    );
    const { result } = renderHook(() =>
      useDebatePreviewClips(debateFixture({ preview: true }, { preview: false }), true, { streamEnabled: true })
    );
    await waitFor(() => expect(result.current.clips.slot1).not.toBeNull());

    act(() => result.current.refresh(1));
    await waitFor(() => expect(result.current.clips.slot1).toBe('https://clip.test/slot1.webm?fresh'));
    // The fresh URL failing too is not answered by another signature.
    act(() => result.current.refresh(1));
    await waitFor(() => expect(result.current.clips.slot1).toBeNull());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('reports the offset between the two clips from started_at_ms and preview_start_seconds', () => {
    const { result } = renderHook(() =>
      useDebatePreviewClips(
        debateFixture(
          { preview: true, startedAtMs: 1_700_000_000_250, previewStart: 12 },
          { preview: true, startedAtMs: 1_700_000_000_000, previewStart: 12 }
        ),
        false,
        { streamEnabled: true }
      )
    );
    expect(result.current.offsetSeconds).toBeCloseTo(0.25);
  });
});

describe('previewSyncCorrection', () => {
  it('leaves a pair that is in step alone', () => {
    expect(previewSyncCorrection(1.0, 1.3, 4, 0.3)).toBeNull();
    expect(previewSyncCorrection(1.0, 1.4, 4, 0.3)).toBeNull();
  });

  it('moves the follower to the leader plus the offset', () => {
    expect(previewSyncCorrection(1.0, 2.5, 4, 0.3)).toBeCloseTo(1.3);
  });

  it('measures drift the short way round the loop', () => {
    // Leader at 3.9 + 0.3 wraps to 0.2; the follower at 0.1 is 0.1s off, not 3.8s.
    expect(previewSyncCorrection(3.9, 0.1, 4, 0.3)).toBeNull();
    expect(previewSyncCorrection(3.9, 2.0, 4, 0.3)).toBeCloseTo(0.2);
  });

  it('does nothing before the follower knows its length', () => {
    expect(previewSyncCorrection(1, 3, Number.NaN, 0)).toBeNull();
  });
});
