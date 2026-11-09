'use client';

import * as React from 'react';

const POSTER_SELECTOR = 'img[data-debate-poster]';

/**
 * When an already-loaded still painted, on `performance.now()`'s clock. A still from the server HTML
 * can finish before the app hydrates, so its `load` event is gone: its resource entry's
 * `responseEnd` survives (exposed cross-origin too), and nothing paints before first paint.
 */
function loadedAt(img: HTMLImageElement, fallback: number): number {
  try {
    const entries = performance.getEntriesByName(img.currentSrc || img.src, 'resource');
    const resource = entries[entries.length - 1] as PerformanceResourceTiming | undefined;
    if (!resource || resource.responseEnd <= 0) return fallback;
    const firstPaint = performance.getEntriesByName('first-contentful-paint', 'paint')[0]?.startTime ?? 0;
    return Math.min(fallback, Math.max(resource.responseEnd, firstPaint));
  } catch {
    return fallback;
  }
}

const isShown = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

/**
 * Calls `onShown` once, when every still in `element` has painted, with the time the last one did
 * (GEO-3604). A still that fails and is retried from its durable route counts when the retry loads.
 */
export function useStillFrameShown(
  element: React.RefObject<HTMLElement | null>,
  onShown: ((at: number) => void) | undefined
) {
  React.useEffect(() => {
    const root = element.current;
    if (!root || !onShown) return;
    const shownAt = new Map<HTMLImageElement, number>();
    let reported = false;

    const check = () => {
      if (reported) return;
      const stills = [...root.querySelectorAll<HTMLImageElement>(POSTER_SELECTOR)];
      if (stills.length === 0) return;
      const now = performance.now();
      for (const img of stills) if (!shownAt.has(img) && isShown(img)) shownAt.set(img, loadedAt(img, now));
      if (!stills.every(img => shownAt.has(img))) return;
      reported = true;
      onShown(Math.max(...stills.map(img => shownAt.get(img) ?? now)));
    };

    // `load` does not bubble, so it is caught on the way down; stills mounted later arrive here too.
    const onLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement && event.target.matches(POSTER_SELECTOR)) {
        shownAt.set(event.target, performance.now());
        check();
      }
    };
    root.addEventListener('load', onLoad, true);
    check();
    return () => root.removeEventListener('load', onLoad, true);
  }, [element, onShown]);
}
