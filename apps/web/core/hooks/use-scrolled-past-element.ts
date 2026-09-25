'use client';

import * as React from 'react';

type Options = {
  /** CSS selector for the element to watch. Re-queried whenever it leaves the document. */
  selector: string;
  /** How far down the viewport counts as "still visible" — the height of whatever is docked above. */
  topOffset: number;
  enabled?: boolean;
};

type Result = {
  /** Whether the watched element has scrolled up out of view. */
  scrolledPast: boolean;
  /** The element being watched, so a caller can measure it or what it sits inside. */
  target: Element | null;
};

/**
 * Whether the element matching `selector` has scrolled up out of view, above `topOffset`.
 *
 * Deliberately selector-based rather than ref-based. The thing being watched — an entity's title —
 * is drawn by four unrelated branches (the generic header, the claim hero, the topic hero, the
 * profile layout), and the thing that wants the answer is mounted once, above all of them, so there
 * is no ref to hand between the two without threading a context through every branch.
 *
 * `isIntersecting` alone cannot answer this: an element below the fold and an element scrolled off
 * the top both read false. The sign of `boundingClientRect.bottom` is what separates them, and only
 * "above" counts — a title the reader has not reached yet must not raise the bar.
 *
 * The target arrives late and can be replaced: this app paints nothing until hydration, and moving
 * between an entity's tabs swaps the subtree. A `MutationObserver` covers both, guarded on
 * `isConnected` so the usual case is a boolean test rather than a document query per mutation.
 *
 * Answers `false` where `IntersectionObserver` is missing (jsdom, older browsers). The safe failure
 * for a decoration is to stay out of the way.
 */
export function useScrolledPastElement({ selector, topOffset, enabled = true }: Options): Result {
  const [scrolledPast, setScrolledPast] = React.useState(false);
  // Handed back as well as watched. The one element this hook goes to the trouble of finding is also
  // the only handle a caller has on the page it belongs to — the sticky header measures the content
  // column around it — and finding it twice would mean a second `MutationObserver` over the body.
  const [target, setTarget] = React.useState<Element | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      setScrolledPast(false);
      setTarget(null);
      return;
    }

    if (typeof document === 'undefined' || typeof IntersectionObserver === 'undefined') return;

    let watched: Element | null = null;

    const observer = new IntersectionObserver(
      entries => {
        // Entries are queued chronologically and several transitions can arrive in one batch, so a
        // reversible state has to follow the last of them rather than any earlier one.
        const latest = entries.at(-1);
        if (!latest) return;
        setScrolledPast(!latest.isIntersecting && latest.boundingClientRect.bottom <= topOffset);
      },
      // Shrinking the root's top edge by the docked height makes "visible" mean "visible below the
      // bar", which is what the reader actually sees.
      { root: null, rootMargin: `-${topOffset}px 0px 0px 0px`, threshold: 0 }
    );

    const sync = () => {
      if (watched?.isConnected) return;

      const next = document.querySelector(selector);
      if (next === watched) return;

      if (watched) observer.unobserve(watched);
      watched = next;
      setTarget(next);

      if (watched) {
        observer.observe(watched);
      } else {
        // Nothing to watch means nothing to be past. Without this the bar would stay up after the
        // title it belongs to was unmounted.
        setScrolledPast(false);
      }
    };

    sync();

    if (typeof MutationObserver === 'undefined') {
      return () => observer.disconnect();
    }

    const mutations = new MutationObserver(sync);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [selector, topOffset, enabled]);

  return { scrolledPast, target };
}
