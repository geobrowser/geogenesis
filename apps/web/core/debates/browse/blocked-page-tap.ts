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

// While `enabled`, an allowed tap calls `start` inside the gesture, where a refused `play()` is accepted.
// Window capture runs before the gesture pool's `document` listener, which would reload the elements.
export function useBlockedPageTap(enabled: boolean, start: () => void) {
  const onStart = React.useEffectEvent(start);
  React.useEffect(() => {
    if (!enabled) return;
    let lastTouchTapAt = -Infinity;
    const handle = (event: Event) => {
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
