'use client';

import * as React from 'react';

/**
 * Whether an element has come close enough to the viewport to be worth fetching for.
 *
 * A list surface mounts its rows long before anyone looks at them — the explore feed pre-mounts
 * pages of cards thousands of pixels below the fold, and the hub's Claims tab pages in twenty more
 * every time the sentinel is reached. A card whose response reads fire on mount therefore turns one
 * page into dozens of graph requests for claims nobody has scrolled to.
 *
 * Sticky by design: once a card has been near the viewport it stays fetched. Scrolling back past it
 * must not re-run its queries, and must not blank what it has already drawn.
 *
 * Answers `true` where there is no `IntersectionObserver` — jsdom, and any browser old enough to
 * lack it. Both mean "nothing here is going to tell us when this scrolls into view", and the safe
 * failure is a card that fetches eagerly rather than one that never fetches at all.
 */
export function useNearViewport({ rootMargin = '800px' }: { rootMargin?: string } = {}) {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const [nearViewport, setNearViewport] = React.useState(false);

  React.useEffect(() => {
    if (nearViewport) return;

    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }

    if (!container) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setNearViewport(true);
      },
      { rootMargin }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [container, nearViewport, rootMargin]);

  /** A callback ref for the element to watch, and whether it has come into range yet. */
  return { ref: setContainer, nearViewport };
}
