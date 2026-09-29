'use client';

import * as React from 'react';

/** The id `CommentSection` puts on its wrapper — the same anchor the full page scrolls to. */
export const COMMENTS_ANCHOR_ID = 'entity-comments';

/** How long to wait for the section to render at all: the panel first loads the entity, then the body. */
const WAIT_FOR_SECTION_MS = 10_000;

/** How long to keep the section in place once it is there, while the content above it fills in. */
const HOLD_POSITION_MS = 2_000;

/**
 * Scrolls a side panel to the entity's comments — a claim's Activity — when it is opened asking for them.
 *
 * The full page does this from `#entity-comments` in the URL, which the panel has no URL to carry, so
 * the request travels on the panel's target instead and each new target is one request.
 *
 * Two things make a one-off scroll land in the wrong place, and this handles both:
 *
 *  - The section is not there when the panel opens. The panel loads the entity first and only then
 *    renders the body, so this waits for the anchor to appear rather than looking once.
 *  - What sits above it keeps growing after it appears. On a claim, the hero and the Debates/Claims
 *    gallery load their own data, and a scroll taken before they land ends up above the heading. So
 *    the position is re-applied as the content changes, for a short window — and never after the
 *    reader has scrolled, clicked or pressed a key themselves, because at that point the panel is
 *    theirs.
 *
 * Scrolls the container's own `scrollTop`, not `scrollIntoView`, which would also scroll every
 * scrollable ancestor — including the page behind the panel.
 *
 * The anchor is looked up inside the container, not with `getElementById`: an entity page behind the
 * panel has its own `#entity-comments`.
 */
export function useScrollToCommentsOnOpen(container: HTMLElement | null, request: object | null) {
  React.useEffect(() => {
    if (!container || !request) return;

    let found = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const align = () => {
      const anchor = container.querySelector<HTMLElement>(`#${COMMENTS_ANCHOR_ID}`);
      if (!anchor) return;
      const top = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      if (Math.abs(container.scrollTop - top) > 1) container.scrollTop = top;
      if (!found) {
        found = true;
        clearTimeout(timer);
        timer = setTimeout(stop, HOLD_POSITION_MS);
      }
    };

    // Size changes that add no nodes — an image loading, text reflowing — reach it through the
    // resize observer, which watches whatever the container holds now: the loading state is replaced
    // by the body, so the children are re-observed on every change rather than once.
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(align);
    const observeChildren = () => {
      for (const child of Array.from(container.children)) resizeObserver?.observe(child);
    };
    const observer =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            observeChildren();
            align();
          });

    const userEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

    function stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      for (const type of userEvents) container?.removeEventListener(type, stop);
    }

    for (const type of userEvents) container.addEventListener(type, stop, { passive: true });
    observer?.observe(container, { childList: true, subtree: true });
    observeChildren();
    timer = setTimeout(stop, WAIT_FOR_SECTION_MS);
    align();

    return stop;
  }, [container, request]);
}
