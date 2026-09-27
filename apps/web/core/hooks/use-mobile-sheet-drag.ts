'use client';

import * as React from 'react';

import { type PanInfo, useDragControls } from 'framer-motion';

import {
  lockMobileSheetDocumentOverscroll,
  preventMobileSheetPullToRefresh,
  shouldStartMobileSheetDrag,
} from '~/core/utils/mobile-sheet-drag';

const DISMISS_OFFSET_PX = 72;
const DISMISS_VELOCITY_PX_PER_SECOND = 420;

type Options = {
  enabled: boolean;
  onDismiss: () => void;
};

/** Shared drag controls for the app's mobile bottom-sheet surfaces. */
export function useMobileSheetDrag({ enabled, onDismiss }: Options) {
  const dragControls = useDragControls();
  const [overlayElement, setOverlayElement] = React.useState<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    if (!enabled) return;
    return lockMobileSheetDocumentOverscroll();
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled || !overlayElement) return;
    return preventMobileSheetPullToRefresh(overlayElement);
  }, [enabled, overlayElement]);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (enabled && shouldStartMobileSheetDrag(event.target, event.currentTarget)) {
        dragControls.start(event);
      }
    },
    [dragControls, enabled]
  );

  const handleDragEnd = React.useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.y > DISMISS_OFFSET_PX || info.velocity.y > DISMISS_VELOCITY_PX_PER_SECOND) {
        onDismiss();
      }
    },
    [onDismiss]
  );

  return { dragControls, handleDragEnd, handlePointerDown, setOverlayElement };
}
