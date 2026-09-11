import { act, cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from './api';
import type { DebatePlaybackController } from './use-debate-playback';
import { usePlaybackAnalytics } from './use-playback-analytics';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  capture.mockClear();
});

describe('rendered playback measurement lifecycle', () => {
  it('requires visible foreground media progression and flushes once across pagehide and unmount', () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    let observe: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observe = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    const debate = { id: 'debate-a', started_at: null, recordings: [] } as unknown as Debate;
    function Player() {
      const first = React.useRef<HTMLVideoElement>(null);
      const second = React.useRef<HTMLVideoElement>(null);
      const controller = {
        slot1VideoRef: first,
        slot2VideoRef: second,
        ready: true,
        timelineSeconds: 100,
        mutedByUser: true,
        isScrubbing: false,
      } as unknown as DebatePlaybackController;
      const analytics = usePlaybackAnalytics(debate, true, controller);
      return (
        <div ref={analytics.elementRef}>
          <video ref={first} />
          <video ref={second} />
        </div>
      );
    }
    const view = render(<Player />);
    const videos = Array.from(view.container.querySelectorAll('video'));
    for (const video of videos) {
      Object.defineProperties(video, { paused: { value: false }, readyState: { value: 4 } });
    }
    const advance = () =>
      act(() => {
        videos.forEach(video => {
          video.currentTime += 0.5;
        });
        vi.advanceTimersByTime(500);
      });
    advance();
    expect(capture).not.toHaveBeenCalled();
    act(() =>
      observe(
        [{ isIntersecting: true, intersectionRatio: 0.8 }] as IntersectionObserverEntry[],
        {} as IntersectionObserver
      )
    );
    for (let i = 0; i < 5; i++) {
      act(() => videos[1].dispatchEvent(new Event('ratechange')));
      advance();
    }
    // A context boundary flushes before identity replacement; pagehide cannot emit it again.
    act(() => window.dispatchEvent(new Event('geo-analytics-context-changing')));
    act(() => window.dispatchEvent(new Event('pagehide')));
    view.unmount();
    const intervals = capture.mock.calls.filter(([event]) => event === 'debate_playback_interval');
    expect(intervals).toHaveLength(1);
    expect(intervals[0][1]).toMatchObject({ active_ms: 2500, media_start_ms: 500, media_end_ms: 3000 });
    expect(capture.mock.calls.filter(([event]) => event === 'debate_exposed')).toHaveLength(1);
    for (let i = 0; i < 3; i++) advance();
    expect(capture.mock.calls.filter(([event]) => event === 'debate_playback_interval')).toHaveLength(1);
  });
});
