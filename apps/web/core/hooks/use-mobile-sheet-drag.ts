'use client';

import * as React from 'react';

import { type MotionValue, animate, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

import {
  type MobileSheetSnap,
  attachMobileSheetGestures,
  getMobileSheetSurface,
  lockMobileSheetDocumentOverscroll,
  resolveMobileSheetRelease,
  watchMobileSheetContentScroll,
} from '~/core/utils/mobile-sheet-drag';

const SNAP_SPRING = { type: 'spring', damping: 32, stiffness: 340 } as const;
const DISMISS_TWEEN = { type: 'tween', ease: 'easeIn', duration: 0.18 } as const;
// Imperative `animate` ignores `MotionConfig`, so reduced motion is honoured here directly.
const INSTANT = { duration: 0 } as const;
const PEEK_CORNER_RADIUS_PX = 16;

/**
 * The slide-up entrance for a sheet surface. `velocity: 0` matters: the surface's `y` is the
 * hook's long-lived motion value, and framer seeds a spring with that value's tracked velocity, so
 * the jump to the starting offset on mount read as a hard downward kick and the sheet overshot
 * ~145px past its resting place.
 */
export const MOBILE_SHEET_ENTRANCE_SPRING = { type: 'spring', damping: 30, stiffness: 320, velocity: 0 } as const;

export type MobileSheetStyle = {
  top: MotionValue<number>;
  /** Driven by the surface's slide-up entrance. */
  y: MotionValue<number>;
  borderTopLeftRadius: MotionValue<number>;
  borderTopRightRadius: MotionValue<number>;
};

type Options = {
  enabled: boolean;
  onDismiss: () => void;
  /** Distance from the viewport top to the sheet's top edge while it is a container. */
  peekTopPx: number;
  /** Natural-height content to fit in peek mode, capped by `peekTopPx`. */
  peekContent?: HTMLElement | null;
  /** Start a fresh preview when the requested entity changes without closing the sheet. */
  resetKey?: unknown;
};

/**
 * Shared gestures for the app's mobile bottom sheets. A sheet opens as a container (`peek`), goes
 * full screen from an upward swipe on the handle or its content, collapses back when pulled down from
 * the top of its content, and dismisses when pulled down from `peek`. See `resolveMobileSheetRelease`
 * for the one-motion dismiss from full screen.
 *
 * Pass `sheetStyle` to `MobileSheetSurface` (or to any surface pinned to the bottom of the
 * viewport, so `top` sets its height) and `setOverlayElement` to the fixed overlay around it.
 */
export function useMobileSheetDrag({ enabled, onDismiss, peekTopPx, peekContent, resetKey }: Options) {
  const top = useMotionValue(peekTopPx);
  const y = useMotionValue(0);
  // Square corners only once the sheet reaches the top of the screen.
  const borderRadius = useTransform(top, value => Math.min(value, PEEK_CORNER_RADIUS_PX));
  const reduceMotion = useReducedMotion();
  const [overlayElement, setOverlayElement] = React.useState<HTMLElement | null>(null);
  // This sheet's place in the stack of open sheets, and the mark on what it renders.
  const [sheet] = React.useState(() => Symbol('mobile sheet'));

  const snapRef = React.useRef<MobileSheetSnap>('peek');
  const [snap, setSnap] = React.useState<MobileSheetSnap>('peek');
  const fittedPeekTopRef = React.useRef(peekTopPx);
  const draggingRef = React.useRef(false);
  const scrolledSinceFullRef = React.useRef(false);
  const dismissingRef = React.useRef(false);
  const onDismissRef = React.useRef(onDismiss);
  React.useLayoutEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const settle = React.useCallback(
    (next: MobileSheetSnap) => {
      if (next === 'full' && snapRef.current !== 'full') scrolledSinceFullRef.current = false;
      snapRef.current = next;
      setSnap(next);
      animate(top, next === 'full' ? 0 : fittedPeekTopRef.current, reduceMotion ? INSTANT : SNAP_SPRING);
    },
    [reduceMotion, top]
  );

  const expand = React.useCallback(() => settle('full'), [settle]);

  /** Slides the sheet off the bottom of the screen, then closes it. */
  const dismiss = React.useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    const offscreen = typeof window === 'undefined' ? top.get() : window.innerHeight;
    animate(top, offscreen, reduceMotion ? INSTANT : DISMISS_TWEEN).then(() => onDismissRef.current());
  }, [reduceMotion, top]);

  // Every open starts as a container.
  React.useLayoutEffect(() => {
    if (!enabled) return;
    top.jump(peekTopPx);
    fittedPeekTopRef.current = peekTopPx;
    snapRef.current = 'peek';
    setSnap('peek');
    draggingRef.current = false;
    scrolledSinceFullRef.current = false;
    dismissingRef.current = false;
  }, [enabled, peekTopPx, resetKey, top]);

  React.useLayoutEffect(() => {
    if (!enabled || !peekContent || !overlayElement) return;
    const surface = getMobileSheetSurface(overlayElement);
    const scroll = peekContent.closest<HTMLElement>('[data-mobile-sheet-scroll]');
    if (!surface || !scroll) return;

    const measure = () => {
      // Include the grab handle and panel navigation, which sit outside the scroll area.
      const chromeHeight = surface.offsetHeight - scroll.clientHeight;
      const previousPeekTop = fittedPeekTopRef.current;
      fittedPeekTopRef.current = Math.max(
        peekTopPx,
        window.innerHeight - Math.ceil(peekContent.getBoundingClientRect().height + chromeHeight)
      );
      if (
        fittedPeekTopRef.current !== previousPeekTop &&
        snapRef.current === 'peek' &&
        !draggingRef.current &&
        !dismissingRef.current
      ) {
        top.jump(fittedPeekTopRef.current);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(peekContent);
    observer.observe(surface);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled, overlayElement, peekContent, peekTopPx, resetKey, top]);

  React.useLayoutEffect(() => {
    if (!enabled) return;
    return lockMobileSheetDocumentOverscroll(sheet);
  }, [enabled, sheet]);

  React.useEffect(() => {
    if (!enabled || !overlayElement) return;

    const detachGestures = attachMobileSheetGestures(overlayElement, {
      // Dragging would stop the dismiss animation, and a stopped animation never resolves its
      // promise, so `onDismiss` would never run.
      canStart: () => !dismissingRef.current,
      getSnap: () => snapRef.current,
      getTop: () => top.get(),
      onDragStart: () => {
        draggingRef.current = true;
        top.stop();
        // A drag during the slide-up entrance takes over from where the sheet visibly is: stop the
        // transform and move what is left of it into `top`, which is what the drag drives.
        const visibleTop = getMobileSheetSurface(overlayElement)?.getBoundingClientRect().top;
        if (visibleTop === undefined || Math.abs(visibleTop - top.get()) < 0.5) return;
        y.stop();
        y.jump(0);
        top.jump(visibleTop);
      },
      onDragMove: next => top.set(next),
      onDragEnd: (releaseTop, velocityY) => {
        draggingRef.current = false;
        const next = resolveMobileSheetRelease({
          from: snapRef.current,
          top: releaseTop,
          velocityY,
          peekTop: fittedPeekTopRef.current,
          scrolledSinceFull: scrolledSinceFullRef.current,
        });
        if (next === 'dismiss') dismiss();
        else settle(next);
      },
      onDragCancel: () => {
        draggingRef.current = false;
        settle(snapRef.current);
      },
    });
    const stopWatchingScroll = watchMobileSheetContentScroll(overlayElement, () => {
      if (snapRef.current === 'full') scrolledSinceFullRef.current = true;
    });

    return () => {
      detachGestures();
      stopWatchingScroll();
    };
  }, [dismiss, enabled, overlayElement, peekTopPx, settle, top, y]);

  const sheetStyle: MobileSheetStyle = {
    top,
    y,
    borderTopLeftRadius: borderRadius,
    borderTopRightRadius: borderRadius,
  };
  return { setOverlayElement, sheetStyle, sheet, snap, expand };
}
