export const MOBILE_SHEET_SCROLL_SELECTOR = '[data-entity-side-panel-scroll]';

const MOBILE_SHEET_DRAG_HANDLE_SELECTOR = '[data-mobile-sheet-drag-handle]';
const INTERACTIVE_DRAG_TARGET_SELECTOR =
  'button, a, input, textarea, select, [role="button"], [contenteditable="true"], [data-no-sheet-drag]';

/**
 * A mobile entity sheet can be pulled down from its non-interactive surface while its content is
 * at the top. Once the content has been scrolled, only the dedicated handle starts a sheet drag so
 * a downward gesture can return the content to the top without fighting the sheet.
 */
export function shouldStartMobileSheetDrag(target: EventTarget | null, root: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;

  if (target.closest(MOBILE_SHEET_DRAG_HANDLE_SELECTOR)) return true;
  if (target.closest(INTERACTIVE_DRAG_TARGET_SELECTOR)) return false;

  const scrollEl = root.querySelector<HTMLElement>(MOBILE_SHEET_SCROLL_SELECTOR);
  return !scrollEl || scrollEl.scrollTop <= 0;
}

/**
 * Safari does not implement directional `touch-action` values, so a non-passive touch listener is
 * still needed to keep a downward sheet drag from becoming browser pull-to-refresh. Upward and
 * horizontal gestures are left native so the sheet content continues to scroll normally.
 */
export function preventMobileSheetPullToRefresh(root: HTMLElement): () => void {
  let gesture:
    | {
        direction: 'pending' | 'down' | 'native';
        startX: number;
        startY: number;
        touchId: number;
      }
    | undefined;

  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1 || !shouldStartMobileSheetDrag(event.target, root)) {
      gesture = undefined;
      return;
    }

    const touch = event.touches[0];
    gesture = {
      direction: 'pending',
      startX: touch.clientX,
      startY: touch.clientY,
      touchId: touch.identifier,
    };
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (!gesture) return;

    const touch = Array.from(event.touches).find(candidate => candidate.identifier === gesture?.touchId);
    if (!touch) return;

    if (gesture.direction === 'pending') {
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 4) return;

      gesture.direction = deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX) ? 'down' : 'native';
    }

    if (gesture.direction === 'down' && event.cancelable) {
      event.preventDefault();
    }
  };

  const clearGesture = () => {
    gesture = undefined;
  };

  root.addEventListener('touchstart', handleTouchStart, { passive: true });
  root.addEventListener('touchmove', handleTouchMove, { passive: false });
  root.addEventListener('touchend', clearGesture);
  root.addEventListener('touchcancel', clearGesture);

  return () => {
    root.removeEventListener('touchstart', handleTouchStart);
    root.removeEventListener('touchmove', handleTouchMove);
    root.removeEventListener('touchend', clearGesture);
    root.removeEventListener('touchcancel', clearGesture);
  };
}
