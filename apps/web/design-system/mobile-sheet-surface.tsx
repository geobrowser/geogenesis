'use client';

import * as React from 'react';

import cx from 'classnames';
import { type LegacyAnimationControls, motion, useAnimationControls, useReducedMotion } from 'framer-motion';

import { MOBILE_SHEET_ENTRANCE_SPRING, type MobileSheetStyle } from '~/core/hooks/use-mobile-sheet-drag';
import { InsideMobileSheet } from '~/core/state/mobile-sheet-cover';

import { MobileSheetGrabHandle } from '~/design-system/mobile-sheet-grab-handle';

type Props = Omit<
  React.ComponentProps<typeof motion.div>,
  'style' | 'initial' | 'animate' | 'transition' | 'children'
> & {
  children: React.ReactNode;
  /** From `useMobileSheetDrag`: sets the sheet's height and corner radius as it moves. */
  sheetStyle: MobileSheetStyle;
  /** Entrance playback controls shared with the drag hook for interruption. */
  sheetControlsRef: React.RefObject<LegacyAnimationControls | null>;
  /** From `useMobileSheetDrag`: marks the content as this sheet's, so it isn't covered by it. */
  sheet: symbol;
};

/**
 * The sliding surface of a mobile bottom sheet: slides up on open, carries the grab handle, and is
 * pinned to the bottom of the viewport so `useMobileSheetDrag` can size it. Render it inside the
 * fixed overlay whose element is passed to the hook's `setOverlayElement`.
 */
export function MobileSheetSurface({ sheetStyle, sheetControlsRef, sheet, className, children, ...props }: Props) {
  const reduceMotion = useReducedMotion();
  const controls = useAnimationControls();

  React.useEffect(() => {
    sheetControlsRef.current = controls;
    controls.start({ transform: 'translateY(0%)' });
    return () => {
      controls.stop();
      // A keyed preview can mount while its predecessor is still animating out.
      if (sheetControlsRef.current === controls) sheetControlsRef.current = null;
    };
  }, [controls, sheetControlsRef]);

  return (
    <motion.div
      data-mobile-sheet-surface
      initial={{ transform: reduceMotion ? 'translateY(0%)' : 'translateY(100%)' }}
      animate={controls}
      transition={MOBILE_SHEET_ENTRANCE_SPRING}
      className={cx(
        'shadow-2xl absolute inset-x-0 bottom-0 z-1 flex flex-col overflow-hidden overscroll-none bg-white',
        className
      )}
      style={sheetStyle}
      {...props}
    >
      <MobileSheetGrabHandle />
      <InsideMobileSheet sheet={sheet}>{children}</InsideMobileSheet>
    </motion.div>
  );
}
