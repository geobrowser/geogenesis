'use client';

import type * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';

import type { MobileSheetStyle } from '~/core/hooks/use-mobile-sheet-drag';

import { MobileSheetGrabHandle } from '~/design-system/mobile-sheet-grab-handle';

type Props = Omit<
  React.ComponentProps<typeof motion.div>,
  'style' | 'initial' | 'animate' | 'transition' | 'children'
> & {
  children: React.ReactNode;
  /** From `useMobileSheetDrag`: sets the sheet's height and corner radius as it moves. */
  sheetStyle: MobileSheetStyle;
};

/**
 * The sliding surface of a mobile bottom sheet: slides up on open, carries the grab handle, and is
 * pinned to the bottom of the viewport so `useMobileSheetDrag` can size it. Render it inside the
 * fixed overlay whose element is passed to the hook's `setOverlayElement`.
 */
export function MobileSheetSurface({ sheetStyle, className, children, ...props }: Props) {
  return (
    <motion.div
      data-mobile-sheet-surface
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      className={cx(
        'shadow-2xl absolute inset-x-0 bottom-0 z-1 flex flex-col overflow-hidden overscroll-none bg-white',
        className
      )}
      style={sheetStyle}
      {...props}
    >
      <MobileSheetGrabHandle />
      {children}
    </motion.div>
  );
}
