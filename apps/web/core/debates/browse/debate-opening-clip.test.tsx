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

  it('hands over to the debate when the clip plays through, and remembers it then, not when it starts', () => {
    loaded([moment(0, 1)]);
    const { result } = renderHook(() => useOpeningClip(props));

    act(() => result.current.markStarted());
    expect(hasSeenOpeningClip('debate-1')).toBe(false);
    expect(result.current.opening).toBe('moment');

    act(() => result.current.end('completed', 1));
    expect(hasSeenOpeningClip('debate-1')).toBe(true);
    expect(result.current.phase).toBe('handover');
    // The debate may start, and keeps loading, while the clip's last frame is still up.
    expect(result.current.holdsDebate).toBe(false);
    expect(result.current.preloadsDebate).toBe(true);
    expect(result.current.moment?.momentIndex).toBe(0);

    act(() => result.current.finish());
    expect(result.current.phase).toBe('done');
    expect(result.current.moment).toBeNull();
    // Still reported as having opened on the clip, for the rest of this play.
    expect(result.current.opening).toBe('moment');
  });

  it('remembers a skipped clip as seen', () => {
    loaded([moment(0, 1)]);
    const { result } = renderHook(() => useOpeningClip(props));
    act(() => result.current.end('switched_to_full', 0.2));

    expect(hasSeenOpeningClip('debate-1')).toBe(true);
    expect(result.current.phase).toBe('handover');
  });

  it('does not remember a clip moved on from early, and does once most of it played', () => {
    loaded([moment(0, 1)]);
    const early = renderHook(() => useOpeningClip(props));
    act(() => early.result.current.end('skipped', 0.3));
    expect(hasSeenOpeningClip('debate-1')).toBe(false);
    expect(early.result.current.phase).toBe('done');

    const most = renderHook(() => useOpeningClip({ ...props, debateId: 'debate-2' }));
    act(() => most.result.current.end('left', 0.8));
    expect(hasSeenOpeningClip('debate-2')).toBe(true);
  });

  it('loads the debate under the clip only on the active card', () => {
    loaded([moment(0, 1)]);
    expect(renderHook(() => useOpeningClip(props)).result.current.preloadsDebate).toBe(true);
    expect(renderHook(() => useOpeningClip({ ...props, active: false })).result.current.preloadsDebate).toBe(false);
  });

  it('does not cut into a debate that started without the clip when the list lands late', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(() => useOpeningClip(props));
    act(() => vi.advanceTimersByTime(OPENING_CLIP_WAIT_MS));
    expect(result.current.phase).toBe('off');

    loaded([moment(0, 1)]);
    rerender();
    expect(result.current.phase).toBe('off');
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
      handingOver: false,
      leaving: false,
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
    expect(onEnded).toHaveBeenCalledWith('completed', 1);
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

    expect(onEnded).toHaveBeenCalledWith('switched_to_full', expect.closeTo(3_400 / 12_000));
    expect(mocks.capture).toHaveBeenCalledWith(
      'debate_moment_ended',
      expect.objectContaining({ end_reason: 'switched_to_full', furthest_ms: 3_400 })
    );
  });

  it('pauses when the viewer scrolls past and picks up where it was when they come back', () => {
    const { start, at, rerender, props, onEnded, video } = renderClip();
    start();
    at(4);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    play.mockClear();

    rerender(<DebateOpeningClip {...props} active={false} />);
    expect(pause).toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();

    rerender(<DebateOpeningClip {...props} active />);
    expect(play).toHaveBeenCalled();
    expect(video.currentTime).toBe(4);
  });

  it('reports a card that left the feed mid-clip as skipped, and leaving the page as left', () => {
    const started = renderClip();
    started.start();
    started.at(3);
    started.unmount();
    expect(started.onEnded).toHaveBeenCalledWith('skipped', 0.25);

    const left = renderClip();
    left.start();
    fireEvent(window, new Event('pagehide'));
    expect(left.onEnded).toHaveBeenCalledWith('left', 0);
    left.unmount();
    expect(left.onEnded).toHaveBeenCalledTimes(1);
  });

  it('reports nothing for a clip that never started', () => {
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
    expect(refused.onEnded).toHaveBeenCalledWith(null, 0);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('unmutes the element inside the tap itself', () => {
    const { video, onToggleMute, start } = renderClip();
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));

    expect(video.muted).toBe(false);
    expect(onToggleMute).toHaveBeenCalled();
  });

  it('stays transparent until the clip has a frame, so the stills show instead of black', () => {
    const { container, start } = renderClip();
    const overlay = container.querySelector('[data-opening-clip]') as HTMLElement;
    expect(overlay.className).toContain('opacity-0');
    expect(screen.queryByRole('button', { name: 'Skip to full debate' })).toBeNull();

    start();
    expect(overlay.className).toContain('opacity-100');
  });

  it('holds its last frame with no controls while handing over, then fades out', () => {
    const { container, start, rerender, props } = renderClip();
    start();
    rerender(<DebateOpeningClip {...props} handingOver />);
    const overlay = container.querySelector('[data-opening-clip]') as HTMLElement;
    expect(overlay.dataset.openingClipState).toBe('handover');
    expect(overlay.className).toContain('opacity-100');
    expect(screen.queryByRole('button', { name: 'Skip to full debate' })).toBeNull();
    expect(screen.queryByText('the best line')).toBeNull();

    rerender(<DebateOpeningClip {...props} handingOver leaving />);
    expect(overlay.className).toContain('opacity-0');
  });
});
