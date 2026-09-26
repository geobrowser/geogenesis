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
  const [trackedSelector, setTrackedSelector] = React.useState(selector);

  /*
   * A new selector is a new entity, and its title is not in the document yet — so neither of these
   * answers is about the page now being asked for.
   *
   * Adjusted during render rather than in an effect. `sync`'s early return — `next === watched` is
   * true when both are null — used to leave the previous entity's answer standing until an effect
   * cleared it, and a passive effect runs *after* the browser paints: on a client-side navigation to
   * an entity that is already hydrated, the render that first saw the new selector handed back
   * `scrolledPast: true` and the old, detached title, and the bar painted for a frame over a page
   * whose own title had never been observed.
   *
   * This is React's documented way to reset state when a prop changes: setting state during render
   * of the same component makes React re-run it immediately, before committing or painting, so there
   * is no intervening frame to get wrong. `useLayoutEffect` would also beat the paint, but only by
   * committing once and correcting itself — this never emits the wrong value at all.
   */
  if (trackedSelector !== selector) {
    setTrackedSelector(selector);
    setScrolledPast(false);
    setTarget(null);
  }

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
        //
        // Filtered by target first. `unobserve` stops future records; it does not purge ones already
        // queued, so a notification about the title a tab just replaced can land after the swap. Read
        // blindly, that stale record overwrote the measurement taken for the new title — undoing, for
        // a frame, the very thing measuring at the swap exists to fix.
        const latest = entries.filter(entry => entry.target === watched).at(-1);
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
        // Measured here rather than left to the observer's first notification, which does not arrive
        // until a task later. A tab swapping the title for another element of the *same* entity
        // leaves `selector` untouched, so the render-time reset above never runs, and without this
        // the element that just left carried its answer onto the one that replaced it — long enough
        // to paint the bar over a title sitting at the top of a newly opened tab.
        //
        // Measured rather than simply cleared, which would only move the wrong frame to the other
        // direction: a tab opened already scrolled past its title would blink the bar off and back
        // on. This is the predicate the observer itself applies — `isIntersecting` is redundant
        // against a root shrunk by `topOffset`, since anything whose bottom is above that line
        // cannot be intersecting it.
        const rect = watched.getBoundingClientRect();
        const isRendered = rect.width > 0 || rect.height > 0;
        setScrolledPast(isRendered && rect.bottom <= topOffset);

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

    // Coalesced to one lookup a frame. `sync` is cheap while the title is mounted — a connectedness
    // test — but a route that draws none, the debates feed, leaves it querying the document on every
    // batch, and that feed mutates continuously.
    let queued = 0;
    const scheduleSync = () => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        sync();
      });
    };

    const mutations = new MutationObserver(scheduleSync);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (queued) cancelAnimationFrame(queued);
      mutations.disconnect();
      observer.disconnect();
    };
  }, [selector, topOffset, enabled]);

  // `enabled` gets the same treatment for the same reason: its effect branch clears these, and that
  // clearing is a paint too late.
  return enabled ? { scrolledPast, target } : DISABLED;
}

const DISABLED: Result = { scrolledPast: false, target: null };
