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

// The current touch, for the whole page: a card made active by a swipe starts listening mid-touch.
// iOS can count a scroll's touchend as a gesture, so a scroll must never be a tap.
const touch = { start: null as { x: number; y: number } | null, scrolled: false };
let tracking = false;
function trackTouches() {
  if (tracking || typeof window === 'undefined') return;
  tracking = true;
  const passive = { capture: true, passive: true };
  window.addEventListener(
    'touchstart',
    event => {
      const point = firstTouch(event);
      touch.start = point ? { x: point.clientX, y: point.clientY } : null;
      touch.scrolled = false;
    },
    passive
  );
  window.addEventListener(
    'touchmove',
    event => {
      const point = firstTouch(event);
      if (!point || !touch.start) return;
      if (Math.hypot(point.clientX - touch.start.x, point.clientY - touch.start.y) > TAP_SLOP_PX) touch.scrolled = true;
    },
    passive
  );
  window.addEventListener('scroll', () => (touch.scrolled = touch.start !== null || touch.scrolled), passive);
}

/** Whether the touch now ending was a tap: its start was seen, and it neither moved nor scrolled. */
const touchWasTap = () => touch.start !== null && !touch.scrolled;

// While `enabled`, an allowed tap calls `start` inside the gesture, where a refused `play()` is accepted.
// Window capture runs before the gesture pool's `document` listener, which would reload the elements.
export function useBlockedPageTap(enabled: boolean, start: () => void) {
  const onStart = React.useEffectEvent(start);
  React.useEffect(trackTouches, []);
  React.useEffect(() => {
    if (!enabled) return;
    let lastTouchTapAt = -Infinity;
    const handle = (event: Event) => {
      if (event.type === 'touchend' && !touchWasTap()) return;
      if (event.type === 'click' && performance.now() - lastTouchTapAt < 1_000) return;
      if (!inUserGesture() || !tapMayStartBlockedDebate(event.target)) return;
      if (event.type === 'touchend') lastTouchTapAt = performance.now();
      onStart();
    };
    window.addEventListener('touchend', handle, { capture: true, passive: true });
    window.addEventListener('click', handle, { capture: true });
    return () => {
      window.removeEventListener('touchend', handle, { capture: true });
      window.removeEventListener('click', handle, { capture: true });
    };
  }, [enabled]);
}
