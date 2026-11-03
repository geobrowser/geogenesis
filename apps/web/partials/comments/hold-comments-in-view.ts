'use client';

import { ENTITY_COMMENTS_ANCHOR_ID } from './entity-comments-anchor';

/**
 * An attribute selector rather than `#entity-comments`, for the case the side panel scopes its lookup for:
 * the same id earlier in the document, on the page behind the panel. Browsers handle both forms (checked
 * in Chromium and WebKit), but jsdom's `#id` fast path returns null for a scoped query once the id
 * appears earlier in the document, which would leave that case untestable.
 */
const ANCHOR_SELECTOR = `[id="${ENTITY_COMMENTS_ANCHOR_ID}"]`;

/** How long to wait for the section to render at all: the panel first loads the entity, then the body. */
const WAIT_FOR_SECTION_MS = 10_000;

/** How long to keep the section in place once it is there, while the content above it fills in. */
const HOLD_POSITION_MS = 2_000;

/**
 * Brings the comments anchor inside `scroller` to its top and holds it there: waits for the section
 * to render, re-aligns while the content above it fills in, and lets go once the reader scrolls,
 * clicks or presses a key, or the content has had time to settle. See `useScrollToCommentsOnOpen` for
 * why a one-off scroll misses.
 *
 * For the side panel, its scroll container. For the full page (`#entity-comments`, the reply email's
 * `?modal=comments` on a debate's entity page), `document.scrollingElement`: the backlinks and tabs
 * above the section load after it does. Returns the function that stops it.
 */
export function holdCommentsInView(scroller: HTMLElement): () => void {
  // The page's scroller is the viewport: its rect moves with the scroll, where an element's does not.
  const isPage = scroller === document.scrollingElement;
  let found = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const align = () => {
    const anchor = scroller.querySelector<HTMLElement>(ANCHOR_SELECTOR);
    if (!anchor) return;
    const scrollerTop = isPage ? 0 : scroller.getBoundingClientRect().top;
    const top = anchor.getBoundingClientRect().top - scrollerTop + scroller.scrollTop;
    if (Math.abs(scroller.scrollTop - top) > 1) scroller.scrollTop = top;
    if (!found) {
      found = true;
      clearTimeout(timer);
      timer = setTimeout(stop, HOLD_POSITION_MS);
    }
  };

  // Size changes that add no nodes — an image loading, text reflowing — reach it through the
  // resize observer, which watches whatever the scroller holds now: the loading state is replaced
  // by the body, so the children are re-observed on every change rather than once.
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(align);
  const observeChildren = () => {
    for (const child of Array.from(scroller.children)) resizeObserver?.observe(child);
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
    for (const type of userEvents) scroller.removeEventListener(type, stop);
  }

  for (const type of userEvents) scroller.addEventListener(type, stop, { passive: true });
  observer?.observe(scroller, { childList: true, subtree: true });
  observeChildren();
  timer = setTimeout(stop, WAIT_FOR_SECTION_MS);
  align();

  return stop;
}
