import * as React from 'react';

import type { DebateFeedPlayerHandle } from '../browse/debate-feed-player';

type Listener = (positionMs: number) => void;

/**
 * The player's position, once a frame while it plays (GEO-3773), for UI that moves with the
 * playhead: a time readout, progress bars, a playhead line. The player reports its position about
 * four times a second, which jumps half a second at a time at 2x, and re-rendering the editor on
 * every frame would be far worse. So listeners are told directly and write the DOM themselves.
 *
 * Paused, it reads the position once when play stops, and again on `refresh` (after a seek).
 */
export function usePlayheadFrame(handle: React.RefObject<DebateFeedPlayerHandle | null>, playing: boolean) {
  const listenersRef = React.useRef(new Set<Listener>());
  const lastRef = React.useRef<number | null>(null);

  const read = React.useCallback(() => {
    const positionMs = handle.current?.livePositionMs() ?? null;
    if (positionMs === null || positionMs === lastRef.current) return;
    lastRef.current = positionMs;
    for (const listener of listenersRef.current) listener(positionMs);
  }, [handle]);

  React.useEffect(() => {
    read();
    if (!playing) return;
    let frame = requestAnimationFrame(function tick() {
      read();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, read]);

  /** Listen from now on; told the last position at once. Returns the unsubscribe. */
  const subscribe = React.useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    if (lastRef.current !== null) listener(lastRef.current);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return { subscribe, refresh: read };
}

/** Writes the playhead into an element's text each frame, through `format`, without a render. */
export function usePlayheadText(
  frame: ReturnType<typeof usePlayheadFrame>,
  format: (positionMs: number) => string
): React.RefCallback<HTMLElement> {
  const formatRef = React.useRef(format);
  React.useLayoutEffect(() => {
    formatRef.current = format;
  }, [format]);
  const { subscribe } = frame;
  return React.useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      return subscribe(positionMs => {
        element.textContent = formatRef.current(positionMs);
      });
    },
    [subscribe]
  );
}
