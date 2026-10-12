'use client';

import * as React from 'react';

import { type MotionValue, animate, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

import {
  type MobileSheetSnap,
  attachMobileSheetGestures,
  lockMobileSheetDocumentOverscroll,
  resolveMobileSheetRelease,
  watchMobileSheetContentScroll,
} from '~/core/utils/mobile-sheet-drag';

const SNAP_SPRING = { type: 'spring', damping: 32, stiffness: 340 } as const;
const DISMISS_TWEEN = { type: 'tween', ease: 'easeIn', duration: 0.18 } as const;
// Imperative `animate` ignores `MotionConfig`, so reduced motion is honoured here directly.
const INSTANT = { duration: 0 } as const;
const PEEK_CORNER_RADIUS_PX = 16;

export type MobileSheetStyle = {
  top: MotionValue<number>;
  borderTopLeftRadius: MotionValue<number>;
  borderTopRightRadius: MotionValue<number>;
};

type Options = {
  enabled: boolean;
  onDismiss: () => void;
  /** Distance from the viewport top to the sheet's top edge while it is a container. */
  peekTopPx: number;
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
export function useMobileSheetDrag({ enabled, onDismiss, peekTopPx }: Options) {
  const top = useMotionValue(peekTopPx);
  // Square corners only once the sheet reaches the top of the screen.
  const borderRadius = useTransform(top, value => Math.min(value, PEEK_CORNER_RADIUS_PX));
  const reduceMotion = useReducedMotion();
  const [overlayElement, setOverlayElement] = React.useState<HTMLElement | null>(null);

  const snapRef = React.useRef<MobileSheetSnap>('peek');
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
      animate(top, next === 'full' ? 0 : peekTopPx, reduceMotion ? INSTANT : SNAP_SPRING);
    },
    [peekTopPx, reduceMotion, top]
  );

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
    snapRef.current = 'peek';
    scrolledSinceFullRef.current = false;
    dismissingRef.current = false;
  }, [enabled, peekTopPx, top]);

  React.useLayoutEffect(() => {
    if (!enabled) return;
    return lockMobileSheetDocumentOverscroll();
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled || !overlayElement) return;

    const detachGestures = attachMobileSheetGestures(overlayElement, {
      getSnap: () => snapRef.current,
      getTop: () => top.get(),
      onDragStart: () => top.stop(),
      onDragMove: next => top.set(next),
      onDragEnd: (releaseTop, velocityY) => {
        const next = resolveMobileSheetRelease({
          from: snapRef.current,
          top: releaseTop,
          velocityY,
          peekTop: peekTopPx,
          scrolledSinceFull: scrolledSinceFullRef.current,
        });
        if (next === 'dismiss') dismiss();
        else settle(next);
      },
    });
    const stopWatchingScroll = watchMobileSheetContentScroll(overlayElement, () => {
      if (snapRef.current === 'full') scrolledSinceFullRef.current = true;
    });

    return () => {
      detachGestures();
      stopWatchingScroll();
    };
  }, [dismiss, enabled, overlayElement, peekTopPx, settle, top]);

  const sheetStyle: MobileSheetStyle = { top, borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius };
  return { setOverlayElement, sheetStyle };
}
