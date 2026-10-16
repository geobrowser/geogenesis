import { renderHook, waitFor } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from './api';
import { useDebatePlayback } from './use-debate-playback';

const mocks = vi.hoisted(() => ({
  recordingUrl: vi.fn(),
  refreshes: [] as unknown[],
  /** Stands in for the flag and the device check together. */
  mobileRenditionsOn: false,
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

// The real selection, with the flag and the device check replaced: those two are covered in
// mobile-rendition.test.ts, and what matters here is what the hook does with the answer.
vi.mock('./mobile-rendition', async importOriginal => {
  const actual = await importOriginal<typeof import('./mobile-rendition')>();
  return {
    ...actual,
    recordingPlaybackVariant: (recording: Parameters<typeof actual.recordingPlaybackVariant>[0]) =>
      actual.recordingPlaybackVariant(recording, {
        enabled: mocks.mobileRenditionsOn,
        isMobile: () => true,
        canPlay: () => true,
      }),
  };
});

const MP4 = 'video/mp4; codecs="avc1.640028, mp4a.40.2"';

function debateFixture(mobile: { slot1: string | null; slot2: string | null }): Debate {
  return {
    id: 'debate-1',
    started_at: new Date(1_700_000_000_000).toISOString(),
    first_participant_slot: 1,
    turn_durations_ms: [30_000, 30_000],
    participants: [
      { participant_slot: 1, profile_space_id: 'space-1' },
      { participant_slot: 2, profile_space_id: 'space-2' },
    ],
    recordings: [
      {
        participant_slot: 1,
        filename: 'slot1.webm',
        started_at_ms: 1_700_000_000_000,
        mobile_content_type: mobile.slot1,
      },
      {
        participant_slot: 2,
        filename: 'slot2.webm',
        started_at_ms: 1_700_000_000_000,
        mobile_content_type: mobile.slot2,
      },
    ],
  } as unknown as Debate;
}

/** GEO-3118: on a phone the feed signs each recording's 720p H.264 rendition when it has one. */
describe('useDebatePlayback — mobile renditions (GEO-3118)', () => {
  beforeEach(() => {
    mocks.mobileRenditionsOn = false;
    mocks.refreshes = [];
    mocks.recordingUrl.mockReset();
    mocks.recordingUrl.mockImplementation(({ filename, variant }: { filename: string; variant?: string }) =>
      Promise.resolve({ url: `https://cdn.test/${filename}${variant ? `?variant=${variant}` : ''}` })
    );
  });

  it('asks for exactly what it asked for before while the flag is off', async () => {
    const { result } = renderHook(() => useDebatePlayback(debateFixture({ slot1: MP4, slot2: MP4 }), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());

    expect(mocks.recordingUrl.mock.calls.map(([request]) => request)).toStrictEqual([
      { debateId: 'debate-1', filename: 'slot1.webm' },
      { debateId: 'debate-1', filename: 'slot2.webm' },
    ]);
  });

  it('signs the mobile rendition of each slot that has one, and the recording for the slot that does not', async () => {
    mocks.mobileRenditionsOn = true;
    const { result } = renderHook(() => useDebatePlayback(debateFixture({ slot1: MP4, slot2: null }), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());

    expect(mocks.recordingUrl.mock.calls.map(([request]) => request)).toStrictEqual([
      { debateId: 'debate-1', filename: 'slot1.webm', variant: 'mobile' },
      { debateId: 'debate-1', filename: 'slot2.webm' },
    ]);
    expect(result.current.urls).toEqual({
      slot1: 'https://cdn.test/slot1.webm?variant=mobile',
      slot2: 'https://cdn.test/slot2.webm',
    });
  });

  it('falls back to the recording itself when the rendition cannot be signed', async () => {
    mocks.mobileRenditionsOn = true;
    mocks.recordingUrl.mockImplementation(({ filename, variant }: { filename: string; variant?: string }) =>
      variant
        ? Promise.reject(new Error('recording_variant_not_found'))
        : Promise.resolve({ url: `https://cdn.test/${filename}` })
    );
    const { result } = renderHook(() => useDebatePlayback(debateFixture({ slot1: MP4, slot2: MP4 }), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());

    expect(result.current.error).toBeNull();
    expect(result.current.urls).toEqual({ slot1: 'https://cdn.test/slot1.webm', slot2: 'https://cdn.test/slot2.webm' });
  });

  it('re-signs the same variant when a tile asks for a fresh URL', async () => {
    mocks.mobileRenditionsOn = true;
    const { result } = renderHook(() => useDebatePlayback(debateFixture({ slot1: MP4, slot2: MP4 }), true));
    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());

    await result.current.refreshSlotUrl(2);

    expect(mocks.refreshes).toStrictEqual([{ debateId: 'debate-1', filename: 'slot2.webm', variant: 'mobile' }]);
  });
});
