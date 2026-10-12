const MOBILE_SHEET_SURFACE_SELECTOR = '[data-mobile-sheet-surface]';
const MOBILE_SHEET_SCROLL_SELECTOR = '[data-mobile-sheet-scroll]';
const MOBILE_SHEET_DRAG_HANDLE_SELECTOR = '[data-mobile-sheet-drag-handle]';
const MOBILE_SHEET_OPEN_ATTRIBUTE = 'data-mobile-sheet-open';
// Vertical swipes still have to scroll, focus or select inside these, so they never move the sheet.
const NO_SHEET_GESTURE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [data-no-sheet-drag]';

const GESTURE_SLOP_PX = 4;
const VELOCITY_SAMPLE_WINDOW_MS = 100;

/** How far (or how fast) a release has to travel before the sheet changes state. */
export const MOBILE_SHEET_SNAP_OFFSET_PX = 64;
export const MOBILE_SHEET_DISMISS_OFFSET_PX = 72;
export const MOBILE_SHEET_FLING_VELOCITY_PX_PER_SECOND = 420;

/**
 * `peek` is the bottom-sheet container that opens first; `full` covers the viewport. The sheet goes
 * full from an upward swipe anywhere on it, LinkedIn-style, rather than scrolling its content.
 */
export type MobileSheetSnap = 'peek' | 'full';

let documentOverscrollLockCount = 0;

/**
 * Prevents browser overscroll gestures while any mobile sheet is open. The reference count keeps
 * the lock in place when sheets are stacked and makes each caller's cleanup idempotent.
 */
export function lockMobileSheetDocumentOverscroll(): () => void {
  const { documentElement, body } = document;

  documentOverscrollLockCount += 1;
  documentElement.setAttribute(MOBILE_SHEET_OPEN_ATTRIBUTE, '');
  body.setAttribute(MOBILE_SHEET_OPEN_ATTRIBUTE, '');

  let released = false;
  return () => {
    if (released) return;
    released = true;
    documentOverscrollLockCount = Math.max(0, documentOverscrollLockCount - 1);

    if (documentOverscrollLockCount === 0) {
      documentElement.removeAttribute(MOBILE_SHEET_OPEN_ATTRIBUTE);
      body.removeAttribute(MOBILE_SHEET_OPEN_ATTRIBUTE);
    }
  };
}

/** Whether a gesture starting on `target` may move the sheet at all, once it proves vertical. */
export function canStartMobileSheetGesture(target: EventTarget | null, root: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;

  const surface = root.querySelector<HTMLElement>(MOBILE_SHEET_SURFACE_SELECTOR);
  if (!surface?.contains(target)) return false;

  if (target.closest(MOBILE_SHEET_DRAG_HANDLE_SELECTOR)) return true;
  return !target.closest(NO_SHEET_GESTURE_SELECTOR);
}

/**
 * Whether a vertical gesture belongs to the sheet rather than to the content's native scroll.
 * The handle always moves the sheet. In `peek`, an upward swipe expands the sheet instead of
 * scrolling. In either state, a downward swipe with the content at its top moves the sheet down.
 */
export function shouldClaimMobileSheetGesture({
  snap,
  direction,
  onHandle,
  contentScrollTop,
}: {
  snap: MobileSheetSnap;
  direction: 'up' | 'down';
  onHandle: boolean;
  contentScrollTop: number;
}): boolean {
  if (onHandle) return true;
  if (direction === 'down') return contentScrollTop <= 0;
  return snap === 'peek';
}

/**
 * Where the sheet settles after a drag is released.
 *
 * From `full`, a pull down normally returns to `peek`. The exception is a sheet that was expanded
 * and then pulled straight back down before its content was scrolled: that reads as "never mind",
 * so it dismisses in one motion instead of stopping at `peek`.
 */
export function resolveMobileSheetRelease({
  from,
  top,
  velocityY,
  peekTop,
  scrolledSinceFull,
}: {
  from: MobileSheetSnap;
  /** The sheet's top edge at release, in px from the viewport top (0 = full screen). */
  top: number;
  /** Positive = moving down. */
  velocityY: number;
  peekTop: number;
  scrolledSinceFull: boolean;
}): MobileSheetSnap | 'dismiss' {
  const fling = MOBILE_SHEET_FLING_VELOCITY_PX_PER_SECOND;

  if (from === 'peek') {
    if (top < peekTop - MOBILE_SHEET_SNAP_OFFSET_PX || velocityY < -fling) return 'full';
    if (top > peekTop + MOBILE_SHEET_DISMISS_OFFSET_PX || velocityY > fling) return 'dismiss';
    return 'peek';
  }

  const pulledDown = top > MOBILE_SHEET_SNAP_OFFSET_PX || velocityY > fling;
  if (!pulledDown) return 'full';
  if (!scrolledSinceFull) return 'dismiss';
  return top > peekTop + MOBILE_SHEET_DISMISS_OFFSET_PX ? 'dismiss' : 'peek';
}

type GestureCallbacks = {
  getSnap: () => MobileSheetSnap;
  /** The sheet's current top edge, read when a gesture is claimed. */
  getTop: () => number;
  onDragStart: () => void;
  onDragMove: (top: number) => void;
  onDragEnd: (top: number, velocityY: number) => void;
};

type ActiveGesture = {
  id: number;
  onHandle: boolean;
  startX: number;
  startY: number;
  decided: 'pending' | 'sheet' | 'native' | 'horizontal';
  /** Pointer Y and sheet top when the sheet claimed the gesture, which can be mid-scroll. */
  anchorY: number;
  anchorTop: number;
  samples: { time: number; y: number }[];
};

function contentScrollTop(root: HTMLElement): number {
  return (
    root.querySelector<HTMLElement>(`${MOBILE_SHEET_SURFACE_SELECTOR} ${MOBILE_SHEET_SCROLL_SELECTOR}`)?.scrollTop ?? 0
  );
}

function releaseVelocity(samples: ActiveGesture['samples']): number {
  const last = samples[samples.length - 1];
  const first = samples.find(sample => last.time - sample.time <= VELOCITY_SAMPLE_WINDOW_MS) ?? last;
  const elapsed = last.time - first.time;
  return elapsed > 0 ? ((last.y - first.y) / elapsed) * 1000 : 0;
}

/**
 * Wires the sheet's drag gestures onto its overlay root. Touch drives everything on phones; a mouse
 * can drag the handle for narrow desktop windows.
 *
 * Touch listeners are non-passive because Safari does not implement directional `touch-action`, so
 * cancelling `touchmove` is the only way to stop a claimed drag from also scrolling the content or
 * becoming pull-to-refresh. A gesture the sheet does not claim is left completely native.
 *
 * In `full`, a content scroll that reaches the top and keeps pulling down is handed to the sheet
 * mid-gesture, so one continuous swipe goes from scrolling the page to collapsing it.
 */
export function attachMobileSheetGestures(root: HTMLElement, callbacks: GestureCallbacks): () => void {
  let gesture: ActiveGesture | undefined;

  const begin = (id: number, target: EventTarget | null, x: number, y: number) => {
    if (!canStartMobileSheetGesture(target, root)) {
      gesture = undefined;
      return;
    }
    gesture = {
      id,
      onHandle: target instanceof Element && Boolean(target.closest(MOBILE_SHEET_DRAG_HANDLE_SELECTOR)),
      startX: x,
      startY: y,
      decided: 'pending',
      anchorY: y,
      anchorTop: 0,
      samples: [],
    };
  };

  const claim = (active: ActiveGesture, y: number) => {
    active.decided = 'sheet';
    active.anchorY = y;
    active.anchorTop = callbacks.getTop();
    active.samples = [{ time: performance.now(), y }];
    callbacks.onDragStart();
  };

  /** Returns true when the sheet owns this move and the browser default must be cancelled. */
  const move = (x: number, y: number): boolean => {
    const active = gesture;
    if (!active) return false;

    if (active.decided === 'pending') {
      const deltaX = x - active.startX;
      const deltaY = y - active.startY;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < GESTURE_SLOP_PX) return false;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        active.decided = 'horizontal';
        return false;
      }
      const owned = shouldClaimMobileSheetGesture({
        snap: callbacks.getSnap(),
        direction: deltaY < 0 ? 'up' : 'down',
        onHandle: active.onHandle,
        contentScrollTop: contentScrollTop(root),
      });
      if (!owned) {
        // Not ours yet, but a full-screen scroll back up to the top can still hand over below.
        active.decided = 'native';
        active.anchorY = y;
        return false;
      }
      // Measured from touch-down so the slop distance still moves the sheet.
      claim(active, active.startY);
    }

    if (active.decided === 'horizontal') return false;

    if (active.decided === 'native') {
      const pullingDown = y > active.anchorY;
      active.anchorY = y;
      if (!pullingDown || callbacks.getSnap() !== 'full' || contentScrollTop(root) > 0) return false;
      claim(active, y);
    }

    active.samples.push({ time: performance.now(), y });
    if (active.samples.length > 12) active.samples.shift();
    // A little resistance past full screen instead of a hard stop.
    const raw = active.anchorTop + (y - active.anchorY);
    callbacks.onDragMove(raw < 0 ? raw * 0.2 : raw);
    return true;
  };

  const end = () => {
    const active = gesture;
    gesture = undefined;
    if (active?.decided !== 'sheet') return;
    const last = active.samples[active.samples.length - 1];
    const raw = active.anchorTop + (last.y - active.anchorY);
    callbacks.onDragEnd(Math.max(0, raw), releaseVelocity(active.samples));
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      // A second finger cancels a sheet drag rather than leaving it stuck mid-way.
      end();
      return;
    }
    const touch = event.touches[0];
    begin(touch.identifier, event.target, touch.clientX, touch.clientY);
  };

  const handleTouchMove = (event: TouchEvent) => {
    const id = gesture?.id;
    const touch = Array.from(event.touches).find(candidate => candidate.identifier === id);
    if (!touch) return;
    if (move(touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
  };

  const handleMouseMove = (event: PointerEvent) => {
    if (event.pointerId !== gesture?.id) return;
    if (move(event.clientX, event.clientY)) event.preventDefault();
  };

  const handleMouseUp = (event: PointerEvent) => {
    if (event.pointerId !== gesture?.id) return;
    window.removeEventListener('pointermove', handleMouseMove);
    window.removeEventListener('pointerup', handleMouseUp);
    window.removeEventListener('pointercancel', handleMouseUp);
    end();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (!(event.target instanceof Element) || !event.target.closest(MOBILE_SHEET_DRAG_HANDLE_SELECTOR)) return;
    begin(event.pointerId, event.target, event.clientX, event.clientY);
    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    window.addEventListener('pointercancel', handleMouseUp);
  };

  root.addEventListener('touchstart', handleTouchStart, { passive: true });
  root.addEventListener('touchmove', handleTouchMove, { passive: false });
  root.addEventListener('touchend', end);
  root.addEventListener('touchcancel', end);
  root.addEventListener('pointerdown', handlePointerDown);

  return () => {
    root.removeEventListener('touchstart', handleTouchStart);
    root.removeEventListener('touchmove', handleTouchMove);
    root.removeEventListener('touchend', end);
    root.removeEventListener('touchcancel', end);
    root.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('pointermove', handleMouseMove);
    window.removeEventListener('pointerup', handleMouseUp);
    window.removeEventListener('pointercancel', handleMouseUp);
  };
}

/**
 * Calls `onScrolled` the first time the sheet's content scrolls away from the top. Scroll events
 * don't bubble, so this listens in the capture phase on the overlay root.
 */
export function watchMobileSheetContentScroll(root: HTMLElement, onScrolled: () => void): () => void {
  const handleScroll = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches(MOBILE_SHEET_SCROLL_SELECTOR) && target.scrollTop > 0) {
      onScrolled();
    }
  };
  root.addEventListener('scroll', handleScroll, true);
  return () => root.removeEventListener('scroll', handleScroll, true);
}
