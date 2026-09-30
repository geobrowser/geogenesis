import { act, cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, expect, it, vi } from 'vitest';

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

// Mirrors DebateFeedPlayer: `ready` stays true (URLs kept) while `releaseMedia` swaps the <video>
// elements for a placeholder, so the measurement has to re-bind to the new elements.
it('measures playback again after a released card re-attaches its videos (GEO-3067)', () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  let observe: IntersectionObserverCallback = () => {};
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        observe = cb;
      }
      observe() {}
      disconnect() {}
    }
  );
  const debate = { id: 'debate-a', started_at: null, recordings: [] } as unknown as Debate;
  function Player({ released }: { released: boolean }) {
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
    const analytics = usePlaybackAnalytics(debate, true, controller, !released);
    return (
      <div ref={analytics.elementRef}>
        {released ? (
          <div>Loading…</div>
        ) : (
          <>
            <video ref={first} />
            <video ref={second} />
          </>
        )}
      </div>
    );
  }
  const view = render(<Player released={false} />);
  view.rerender(<Player released />);
  view.rerender(<Player released={false} />);
  const videos = Array.from(view.container.querySelectorAll('video'));
  for (const v of videos) Object.defineProperties(v, { paused: { value: false }, readyState: { value: 4 } });
  act(() =>
    observe(
      [{ isIntersecting: true, intersectionRatio: 0.8 }] as IntersectionObserverEntry[],
      {} as IntersectionObserver
    )
  );
  for (let i = 0; i < 6; i++)
    act(() => {
      videos.forEach(v => {
        v.currentTime += 0.5;
      });
      vi.advanceTimersByTime(500);
    });
  act(() => window.dispatchEvent(new Event('geo-analytics-context-changing')));
  const intervals = capture.mock.calls.filter(([e]) => e === 'debate_playback_interval');
  expect(intervals.length).toBeGreaterThan(0);
});
