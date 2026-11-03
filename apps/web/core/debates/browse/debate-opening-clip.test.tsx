import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateMoment } from '~/core/debates/moments';

import { DebateOpeningClip, OPENING_CLIP_WAIT_MS, useOpeningClip } from './debate-opening-clip';
import { hasSeenOpeningClip, markOpeningClipSeen } from './opening-clip';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  moments: { data: undefined as DebateMoment[] | undefined, isError: false, isSuccess: false },
  useDebateMoments: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));
vi.mock('~/core/debates/hooks', () => ({
  useDebateMoments: (debateId: string, enabled: boolean) => {
    mocks.useDebateMoments(debateId, enabled);
    return mocks.moments;
  },
}));

// Node's own webstorage can shadow jsdom's with an object that has no methods, so the suite installs
// a plain Map-backed Storage rather than depending on which one it gets.
function installStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

const moment = (momentIndex: number, score: number | null): DebateMoment => ({
  id: `clip-${momentIndex}`,
  momentIndex,
  claimIndex: momentIndex,
  claimText: `claim ${momentIndex}`,
  score,
  participantSlot: 1,
  clipUrl: `https://chat.example/debates/d1/moments/clip-${momentIndex}/content`,
  durationMs: 12_000,
  subtitles: [{ startMs: 0, endMs: 2_000, text: 'the best line' }],
});

function loaded(list: DebateMoment[]) {
  mocks.moments = { data: list, isError: false, isSuccess: true };
}

function pending() {
  mocks.moments = { data: undefined, isError: false, isSuccess: false };
}

beforeEach(() => {
  installStorage();
  mocks.capture.mockReset();
  mocks.useDebateMoments.mockReset();
  pending();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useOpeningClip', () => {
  const props = { debateId: 'debate-1', active: true, near: true, linkedMoment: false };

  it('opens on the top-scored moment and holds the debate while it plays', () => {
    loaded([moment(1, 0.4), moment(2, 0.9)]);
    const { result } = renderHook(() => useOpeningClip(props));

    expect(result.current.phase).toBe('clip');
    expect(result.current.moment?.momentIndex).toBe(2);
    expect(result.current.holdsDebate).toBe(true);
    expect(result.current.opening).toBe('title_card');
  });

  it('holds while the list loads, then gives up and plays as before', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOpeningClip(props));
    expect(result.current.phase).toBe('waiting');
    expect(result.current.holdsDebate).toBe(true);

    act(() => vi.advanceTimersByTime(OPENING_CLIP_WAIT_MS));

    expect(result.current.phase).toBe('off');
    expect(result.current.holdsDebate).toBe(false);
  });

  it('plays as before for a debate with no published moments, or a failed read', () => {
    loaded([]);
    expect(renderHook(() => useOpeningClip(props)).result.current.phase).toBe('off');

    mocks.moments = { data: undefined, isError: true, isSuccess: false };
    expect(renderHook(() => useOpeningClip(props)).result.current.phase).toBe('off');
  });

  it('does not open on the clip for a link that named a moment', () => {
    loaded([moment(0, 1)]);
    const { result } = renderHook(() => useOpeningClip({ ...props, linkedMoment: true }));

    expect(result.current.phase).toBe('off');
    expect(mocks.useDebateMoments).toHaveBeenLastCalledWith('debate-1', false);
  });

  it('does not show a clip this browser has already played on that debate', () => {
    markOpeningClipSeen('debate-1');
    loaded([moment(0, 1)]);

    expect(renderHook(() => useOpeningClip(props)).result.current.phase).toBe('off');
    expect(renderHook(() => useOpeningClip({ ...props, debateId: 'debate-2' })).result.current.phase).toBe('clip');
  });

  it('remembers the clip once it starts, reports the opening, and lets the debate go when it ends', () => {
    loaded([moment(0, 1)]);
    const { result } = renderHook(() => useOpeningClip(props));

    act(() => result.current.markStarted());
    expect(hasSeenOpeningClip('debate-1')).toBe(true);
    expect(result.current.opening).toBe('moment');

    act(() => result.current.finish());
    expect(result.current.phase).toBe('done');
    expect(result.current.holdsDebate).toBe(false);
    // Still reported as having opened on the clip, for the rest of this play.
    expect(result.current.opening).toBe('moment');
  });

  it('holds nothing on a card that is not the active one', () => {
    loaded([moment(0, 1)]);
    const { result } = renderHook(() => useOpeningClip({ ...props, active: false }));

    expect(result.current.phase).toBe('clip');
    expect(result.current.holdsDebate).toBe(false);
  });

  it('starts over for a different debate handed to the same player', () => {
    loaded([moment(0, 1)]);
    const { result, rerender } = renderHook(p => useOpeningClip(p), { initialProps: props });
    act(() => result.current.finish());
    expect(result.current.phase).toBe('done');

    rerender({ ...props, debateId: 'debate-2' });
    expect(result.current.phase).toBe('clip');
  });
});

describe('DebateOpeningClip', () => {
  let play: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderClip(overrides: Partial<React.ComponentProps<typeof DebateOpeningClip>> = {}) {
    const handlers = {
      onStarted: vi.fn(),
      onEnded: vi.fn(),
      onForcedMute: vi.fn(),
      onToggleMute: vi.fn(),
    };
    const props = {
      debateId: 'debate-1',
      moment: moment(2, 0.9),
      active: true,
      muted: true,
      playbackInstanceId: 'instance-1',
      ...handlers,
      ...overrides,
    };
    const view = render(<DebateOpeningClip {...props} />);
    const video = view.container.querySelector('video') as HTMLVideoElement;
    const start = () => fireEvent.playing(video);
    const at = (seconds: number) => {
      Object.defineProperty(video, 'currentTime', { value: seconds, configurable: true });
      fireEvent.timeUpdate(video);
    };
    return { ...view, ...handlers, video, start, at, props };
  }

  it('plays the clip file, muted, with its subtitles', () => {
    const { video, start, at } = renderClip();
    start();
    at(1);

    expect(video.getAttribute('src')).toBe('https://chat.example/debates/d1/moments/clip-2/content');
    expect(video.muted).toBe(true);
    expect(play).toHaveBeenCalled();
    expect(screen.getByText('the best line')).toBeTruthy();
  });

  it('carries on into the debate when the clip plays to its end, and reports it completed', () => {
    const { video, start, at, onStarted, onEnded } = renderClip();
    start();
    at(12);
    fireEvent.ended(video);

    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith('completed');
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_moment_ended',
      expect.objectContaining({
        measurement_version: 'growth-v2',
        debate_id: 'debate-1',
        moment_id: 'clip-2',
        moment_index: 2,
        moment_role: 'opening',
        playback_instance_id: 'instance-1',
        end_reason: 'completed',
        furthest_ms: 12_000,
        moment_duration_ms: 12_000,
      })
    );
  });

  it('skips straight to the full debate', () => {
    const { start, at, onEnded } = renderClip();
    start();
    at(3.4);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to full debate' }));

    expect(onEnded).toHaveBeenCalledWith('switched_to_full');
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_moment_ended',
      expect.objectContaining({ end_reason: 'switched_to_full', furthest_ms: 3_400 })
    );
  });

  it('reports a viewer who moved on mid-clip as skipped, once', () => {
    const { start, rerender, props, onEnded } = renderClip();
    start();
    rerender(<DebateOpeningClip {...props} active={false} />);
    rerender(<DebateOpeningClip {...props} active={false} />);

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith('skipped');
  });

  it('reports leaving when it unmounts mid-clip, and nothing for a clip that never started', () => {
    const started = renderClip();
    started.start();
    started.unmount();
    expect(started.onEnded).toHaveBeenCalledWith('left');

    mocks.capture.mockReset();
    const unstarted = renderClip();
    unstarted.unmount();
    expect(unstarted.onEnded).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('does not play on a card that is not the active one', () => {
    renderClip({ active: false });
    expect(play).not.toHaveBeenCalled();
  });

  it('falls back to muted when the browser refuses sound, and gives the clip up when it refuses that too', async () => {
    play.mockRejectedValueOnce(new DOMException('', 'NotAllowedError'));
    const unmuted = renderClip({ muted: false });
    await act(async () => {});
    expect(unmuted.onForcedMute).toHaveBeenCalled();
    expect(unmuted.video.muted).toBe(true);
    expect(unmuted.onEnded).not.toHaveBeenCalled();
    unmuted.unmount();

    play.mockRejectedValue(new DOMException('', 'NotAllowedError'));
    const refused = renderClip();
    await act(async () => {});
    expect(refused.onEnded).toHaveBeenCalledWith(null);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('unmutes the element inside the tap itself', () => {
    const { video, onToggleMute } = renderClip();
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));

    expect(video.muted).toBe(false);
    expect(onToggleMute).toHaveBeenCalled();
  });
});
