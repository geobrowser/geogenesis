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
 * Sticky by default: once a card has been near the viewport it stays fetched. Scrolling back past
 * it must not re-run its queries, and must not blank what it has already drawn. Media surfaces can
 * opt out so leaving the window releases players and their browser resources.
 *
 * Answers `true` where there is no `IntersectionObserver` — jsdom, and any browser old enough to
 * lack it. Both mean "nothing here is going to tell us when this scrolls into view", and the safe
 * failure is a card that fetches eagerly rather than one that never fetches at all.
 */
export function useNearViewport({
  rootMargin = '800px',
  sticky = true,
}: { rootMargin?: string; sticky?: boolean } = {}) {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const [nearViewport, setNearViewport] = React.useState(false);

  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }

    if (!container) return;

    const observer = new IntersectionObserver(
      entries => {
        if (!sticky) {
          // IntersectionObserver may batch several transitions for this one watched element.
          // Its entries are queued chronologically, so reversible state must follow the last
          // transition rather than treating any earlier intersection as the current state.
          const latest = entries.at(-1);
          if (latest) setNearViewport(latest.isIntersecting);
          return;
        }
        // Sticky mode asks whether the element has *ever* entered the window, so any intersecting
        // entry in a batch is sufficient even when a later entry records that it left again.
        if (entries.some(entry => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [container, rootMargin, sticky]);

  /** The watched element, its callback ref, and whether it is currently/has ever been in range. */
  return { element: container, ref: setContainer, nearViewport };
}
