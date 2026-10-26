import { renderHook, waitFor } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Debate, GeoChatRequestError } from './api';
import { useDebatePlayback } from './use-debate-playback';

const mocks = vi.hoisted(() => ({
  recordingUrl: vi.fn(),
  refreshes: [] as unknown[],
  /** Stands in for the flag and the device check together. */
  mobileRenditionsOn: false,
  /** Stands in for `NEXT_PUBLIC_DEBATE_STREAM_PLAYBACK`. */
  streamOn: false,
}));

vi.mock('~/core/telemetry/logger', () => ({ reportEvent: vi.fn() }));

vi.mock('./hooks', () => ({
  useRecordingPlaybackUrl: () => ({
    lookup: mocks.recordingUrl,
    refresh: (request: unknown) => {
      mocks.refreshes.push(request);
      return mocks.recordingUrl(request);
    },
  }),
  useDebateTranscript: () => ({ data: { segments: [] }, isLoading: false, error: null }),
  useDebateMedia: () => ({ data: { turn_segments: [] }, isPending: false, isLoading: false, error: null }),
}));

vi.mock('./stream-playback', async importOriginal => {
  const actual = await importOriginal<typeof import('./stream-playback')>();
  return {
    ...actual,
    recordingStreamVariant: (recording: Parameters<typeof actual.recordingStreamVariant>[0]) =>
      actual.recordingStreamVariant(recording, { enabled: mocks.streamOn }),
  };
});

// The real selection, with the flag and the browser check replaced: those two are covered in
// mobile-rendition.test.ts, and what matters here is what the hook does with the answer.
vi.mock('./mobile-rendition', async importOriginal => {
  const actual = await importOriginal<typeof import('./mobile-rendition')>();
  return {
    ...actual,
    recordingPlaybackVariant: (recording: Parameters<typeof actual.recordingPlaybackVariant>[0]) =>
      actual.recordingPlaybackVariant(recording, {
        enabled: mocks.mobileRenditionsOn,
        canPlay: () => true,
      }),
  };
});

const MP4 = 'video/mp4; codecs="avc1.640028, mp4a.40.2"';

type Ready = { stream?: boolean; mobile?: string | null };

function debateFixture(slot1: Ready, slot2: Ready): Debate {
  const recording = (slot: 1 | 2, ready: Ready) => ({
    participant_slot: slot,
    filename: `slot${slot}.webm`,
    started_at_ms: 1_700_000_000_000,
    mobile_content_type: ready.mobile ?? null,
    ...(ready.stream === undefined ? {} : { stream_ready: ready.stream }),
  });
  return {
    id: 'debate-1',
    started_at: new Date(1_700_000_000_000).toISOString(),
    first_participant_slot: 1,
    turn_durations_ms: [30_000, 30_000],
    participants: [
      { participant_slot: 1, profile_space_id: 'space-1' },
      { participant_slot: 2, profile_space_id: 'space-2' },
    ],
    recordings: [recording(1, slot1), recording(2, slot2)],
  } as unknown as Debate;
}

const requests = () => mocks.recordingUrl.mock.calls.map(([request]) => request);

/** Full playback from Cloudflare Stream, behind NEXT_PUBLIC_DEBATE_STREAM_PLAYBACK. */
describe('useDebatePlayback — Cloudflare Stream', () => {
  beforeEach(() => {
    mocks.mobileRenditionsOn = false;
    mocks.streamOn = false;
    mocks.refreshes = [];
    mocks.recordingUrl.mockReset();
    mocks.recordingUrl.mockImplementation(({ filename, variant }: { filename: string; variant?: string }) =>
      Promise.resolve({
        url:
          variant === 'stream'
            ? `https://videodelivery.test/${filename}/manifest/video.m3u8`
            : `https://cdn.test/${filename}${variant ? `?variant=${variant}` : ''}`,
      })
    );
  });

  it('asks for exactly what it asked for before while the flag is off, even with a Stream copy ready', async () => {
    const { result } = renderHook(() => useDebatePlayback(debateFixture({ stream: true }, { stream: true }), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());

    expect(requests()).toStrictEqual([
      { debateId: 'debate-1', filename: 'slot1.webm' },
      { debateId: 'debate-1', filename: 'slot2.webm' },
    ]);
    expect(result.current.streams).toEqual({ slot1: false, slot2: false });
  });

  it('signs the stream variant of each slot whose copy is ready, and marks those URLs as streams', async () => {
    mocks.streamOn = true;
    const { result } = renderHook(() => useDebatePlayback(debateFixture({ stream: true }, { stream: false }), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());

    expect(requests()).toStrictEqual([
      { debateId: 'debate-1', filename: 'slot1.webm', variant: 'stream' },
      { debateId: 'debate-1', filename: 'slot2.webm' },
    ]);
    expect(result.current.urls).toEqual({
      slot1: 'https://videodelivery.test/slot1.webm/manifest/video.m3u8',
      slot2: 'https://cdn.test/slot2.webm',
    });
    expect(result.current.streams).toEqual({ slot1: true, slot2: false });
    expect(result.current.renditions).toEqual({ slot1: false, slot2: false });
  });

  it('ignores a server that predates Stream (no stream_ready at all)', async () => {
    mocks.streamOn = true;
    const { result } = renderHook(() => useDebatePlayback(debateFixture({}, {}), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());

    expect(requests()).toStrictEqual([
      { debateId: 'debate-1', filename: 'slot1.webm' },
      { debateId: 'debate-1', filename: 'slot2.webm' },
    ]);
  });

  it('falls back to the original recording on stream_not_configured, with no error shown', async () => {
    mocks.streamOn = true;
    mocks.recordingUrl.mockImplementation(({ filename, variant }: { filename: string; variant?: string }) =>
      variant === 'stream'
        ? Promise.reject(new GeoChatRequestError('Stream is not configured', 'stream_not_configured', 503))
        : Promise.resolve({ url: `https://cdn.test/${filename}` })
    );
    const { result } = renderHook(() => useDebatePlayback(debateFixture({ stream: true }, { stream: true }), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());

    expect(result.current.error).toBeNull();
    expect(result.current.urls).toEqual({ slot1: 'https://cdn.test/slot1.webm', slot2: 'https://cdn.test/slot2.webm' });
    expect(result.current.streams).toEqual({ slot1: false, slot2: false });
    expect(requests()).toStrictEqual([
      { debateId: 'debate-1', filename: 'slot1.webm', variant: 'stream' },
      { debateId: 'debate-1', filename: 'slot2.webm', variant: 'stream' },
      { debateId: 'debate-1', filename: 'slot1.webm' },
      { debateId: 'debate-1', filename: 'slot2.webm' },
    ]);
  });

  it('falls back to the mobile rendition, where there is one, before the recording', async () => {
    mocks.streamOn = true;
    mocks.mobileRenditionsOn = true;
    mocks.recordingUrl.mockImplementation(({ filename, variant }: { filename: string; variant?: string }) =>
      variant === 'stream'
        ? Promise.reject(new GeoChatRequestError('not ready', 'recording_variant_not_found', 404))
        : Promise.resolve({ url: `https://cdn.test/${filename}${variant ? `?variant=${variant}` : ''}` })
    );
    const { result } = renderHook(() =>
      useDebatePlayback(debateFixture({ stream: true, mobile: MP4 }, { stream: true }), true)
    );
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());

    expect(result.current.urls).toEqual({
      slot1: 'https://cdn.test/slot1.webm?variant=mobile',
      slot2: 'https://cdn.test/slot2.webm',
    });
    expect(result.current.renditions).toEqual({ slot1: true, slot2: false });
  });

  it('re-signs the stream when a tile asks for a fresh URL, and the fallback when it abandons Stream', async () => {
    mocks.streamOn = true;
    const { result } = renderHook(() => useDebatePlayback(debateFixture({ stream: true }, { stream: true }), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());

    await result.current.refreshSlotUrl(2);
    await result.current.refreshSlotUrl(1, { abandonStream: true });

    expect(mocks.refreshes).toStrictEqual([
      { debateId: 'debate-1', filename: 'slot2.webm', variant: 'stream' },
      { debateId: 'debate-1', filename: 'slot1.webm' },
    ]);
    await waitFor(() => expect(result.current.urls.slot1).toBe('https://cdn.test/slot1.webm'));
    expect(result.current.streams).toEqual({ slot1: false, slot2: true });
  });
});
