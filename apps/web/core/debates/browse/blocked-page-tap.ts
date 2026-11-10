import * as React from 'react';

import { inUserGesture } from '~/core/utils/video/gesture-media-pool';

/** Elements whose tap does something of its own, so it must not also start the debate. */
const OWN_ACTION =
  'a, button, input, select, textarea, label, summary, video[controls], [role="button"], [role="link"], [role="tab"], [role="slider"], [role="menuitem"], [contenteditable=""], [contenteditable="true"]';

/**
 * Whether a tap on `target` may also start a debate the browser refused to autoplay (GEO-3602).
 * The claim title opens a panel and leaves the video on screen, so it starts the debate too.
 */
export function tapMayStartBlockedDebate(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-entity-side-panel-opener]')) return true;
  return target.closest(OWN_ACTION) === null;
}

/** How far a touch may move and still be a tap rather than a scroll. */
const TAP_SLOP_PX = 10;

const firstTouch = (event: Event) => (event as TouchEvent).touches?.[0] ?? null;

// While `enabled`, an allowed tap calls `start` inside the gesture, where a refused `play()` is accepted.
// Window capture runs before the gesture pool's `document` listener, which would reload the elements.
export function useBlockedPageTap(enabled: boolean, start: () => void) {
  const onStart = React.useEffectEvent(start);
  React.useEffect(() => {
    if (!enabled) return;
    let lastTouchTapAt = -Infinity;
    // A touch that scrolled is never a tap: iOS can count the touchend that ends a scroll as a gesture.
    let touchStart: { x: number; y: number } | null = null;
    let scrolled = false;
    const onTouchStart = (event: Event) => {
      const touch = firstTouch(event);
      touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
      scrolled = false;
    };
    const onTouchMove = (event: Event) => {
      const touch = firstTouch(event);
      if (!touch || !touchStart) return;
      if (Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) > TAP_SLOP_PX) scrolled = true;
    };
    const onScroll = () => {
      if (touchStart) scrolled = true;
    };
    const handle = (event: Event) => {
      if (event.type === 'touchend') {
        const wasScroll = scrolled;
        touchStart = null;
        scrolled = false;
        if (wasScroll) return;
      }
      if (event.type === 'click' && performance.now() - lastTouchTapAt < 1_000) return;
      if (!inUserGesture() || !tapMayStartBlockedDebate(event.target)) return;
      if (event.type === 'touchend') lastTouchTapAt = performance.now();
      onStart();
    };
    const passive = { capture: true, passive: true };
    window.addEventListener('touchstart', onTouchStart, passive);
    window.addEventListener('touchmove', onTouchMove, passive);
    window.addEventListener('scroll', onScroll, passive);
    window.addEventListener('touchend', handle, passive);
    window.addEventListener('click', handle, { capture: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart, { capture: true });
      window.removeEventListener('touchmove', onTouchMove, { capture: true });
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('touchend', handle, { capture: true });
      window.removeEventListener('click', handle, { capture: true });
    };
  }, [enabled]);
}
