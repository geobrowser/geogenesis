import * as React from 'react';

import { ENTITY_SIDE_PANEL_LAYER_SELECTOR } from '~/core/utils/entity-side-panel-link';
import { inUserGesture } from '~/core/utils/video/gesture-media-pool';

/** Elements whose tap does something of its own, so it must not also start the debate. */
const OWN_ACTION =
  'a, button, input, select, textarea, label, summary, video[controls], [role="button"], [role="link"], [role="tab"], [role="slider"], [role="menuitem"], [contenteditable=""], [contenteditable="true"]';

/**
 * Whether a tap on `target` may also start or unmute the debate (GEO-3602). Not one in the side panel
 * or a dialog. The debate's own claim title opens a panel and leaves the video on screen, so it does.
 */
export function tapMayStartBlockedDebate(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(ENTITY_SIDE_PANEL_LAYER_SELECTOR)) return false;
  if (target.closest('[data-debate-claim-title]')) return true;
  return target.closest(OWN_ACTION) === null;
}

/** How far a touch may move and still be a tap rather than a scroll. */
const TAP_SLOP_PX = 10;

const firstTouch = (event: Event) => (event as TouchEvent).touches?.[0] ?? null;

// The current touch, for the whole page: a card made active by a swipe starts listening mid-touch.
// iOS can count a scroll's touchend as a gesture, so a scroll must never be a tap.
const touch = { start: null as { x: number; y: number } | null, scrolled: false };

/** Cards waiting for a tap, in the order they asked. Only the latest gets it, so one tap starts one debate. */
const claimants: Array<{ current: () => void }> = [];

let listening = false;
function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
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
  // Touch only: phones and tablets. A mouse click never starts or unmutes from the page.
  // Window capture runs before the gesture pool's `document` listener, which would reload the elements.
  window.addEventListener(
    'touchend',
    event => {
      const owner = claimants.at(-1);
      if (!owner || touch.start === null || touch.scrolled) return;
      if (!inUserGesture() || !tapMayStartBlockedDebate(event.target)) return;
      owner.current();
    },
    passive
  );
}

/** While `enabled`, a tap on the page calls `start` inside the gesture, if this is the latest card to ask. */
export function useBlockedPageTap(enabled: boolean, start: () => void) {
  const onStart = React.useEffectEvent(start);
  React.useEffect(listen, []);
  React.useEffect(() => {
    if (!enabled) return;
    const claimant = { current: () => onStart() };
    claimants.push(claimant);
    return () => {
      claimants.splice(claimants.indexOf(claimant), 1);
    };
  }, [enabled]);
}
