import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { Debate } from './api';

const mocks = vi.hoisted(() => ({ recordingUrl: vi.fn() }));

// The hook imports exactly these two from './hooks'. Mocking the module blanks everything
// else in it, so anything omitted here arrives as undefined.
vi.mock('./hooks', () => ({
  useRecordingUrl: () => ({ mutateAsync: mocks.recordingUrl }),
  useDebateTranscript: () => ({ data: { segments: [] }, isLoading: false, error: null }),
}));

import { useDebatePlayback } from './use-debate-playback';

function debateFixture(id = 'debate-1'): Debate {
  return {
    id,
    started_at: new Date(1_700_000_000_000).toISOString(),
    first_participant_slot: 1,
    turn_durations_ms: [30_000, 30_000],
    participants: [
      { participant_slot: 1, profile_space_id: 'space-1' },
      { participant_slot: 2, profile_space_id: 'space-2' },
    ],
    recordings: [
      { participant_slot: 1, filename: 'slot1.webm', started_at_ms: 1_700_000_000_000 },
      { participant_slot: 2, filename: 'slot2.webm', started_at_ms: 1_700_000_000_000 },
    ],
  } as unknown as Debate;
}

describe('useDebatePlayback — playback URLs survive re-activation (GEO-2895)', () => {
  beforeEach(() => {
    mocks.recordingUrl.mockReset();
    mocks.recordingUrl.mockImplementation(({ filename }: { filename: string }) =>
      Promise.resolve({ url: `https://cdn.test/${filename}?sig=abc` })
    );
  });

  it('fetches both slot URLs once when the card becomes active', async () => {
    const { result } = renderHook(({ active }) => useDebatePlayback(debateFixture(), active), {
      initialProps: { active: true },
    });

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    expect(result.current.urls.slot2).not.toBeNull();
    expect(mocks.recordingUrl).toHaveBeenCalledTimes(2); // one per slot
  });

  // THE REGRESSION. `active` flips whenever the card crosses the viewport threshold, and the
  // effect used to open with setUrls({slot1: null, slot2: null}) on every flip — blanking the
  // <video> back to the "Loading…" placeholder and re-requesting two signed URLs. That is the
  // flicker. `useRecordingUrl` is a mutation, so nothing upstream de-duplicates the requests.
  it('does NOT refetch or blank when the card is scrolled past and returns', async () => {
    const debate = debateFixture();
    const { result, rerender } = renderHook(({ active }) => useDebatePlayback(debate, active), {
      initialProps: { active: true },
    });

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    const settled = result.current.urls;
    expect(mocks.recordingUrl).toHaveBeenCalledTimes(2);

    rerender({ active: false }); // scrolled away
    rerender({ active: true }); // scrolled back
    rerender({ active: false });
    rerender({ active: true });

    // Same URL objects, never blanked — so `src` never goes null and "Loading…" never returns.
    expect(result.current.urls.slot1).toBe(settled.slot1);
    expect(result.current.urls.slot2).toBe(settled.slot2);
    expect(mocks.recordingUrl).toHaveBeenCalledTimes(2);
  });

  it('does refetch when the debate actually changes', async () => {
    const { result, rerender } = renderHook(({ debate }) => useDebatePlayback(debate, true), {
      initialProps: { debate: debateFixture('debate-1') },
    });

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
    expect(mocks.recordingUrl).toHaveBeenCalledTimes(2);

    rerender({ debate: debateFixture('debate-2') });

    await waitFor(() => expect(mocks.recordingUrl).toHaveBeenCalledTimes(4));
  });

  it('a failed fetch can be retried on the next activation', async () => {
    mocks.recordingUrl.mockRejectedValueOnce(new Error('signing failed'));
    mocks.recordingUrl.mockRejectedValueOnce(new Error('signing failed'));

    const debate = debateFixture();
    const { result, rerender } = renderHook(({ active }) => useDebatePlayback(debate, active), {
      initialProps: { active: true },
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    // Without releasing the key on failure the card would sit on "Loading…" forever.
    rerender({ active: false });
    rerender({ active: true });

    await waitFor(() => expect(result.current.urls.slot1).not.toBeNull());
  });
});
