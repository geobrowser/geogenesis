'use client';

import { useMediaQuery } from '~/core/hooks/use-media-query';

/**
 * Call-room-specific breakpoint (matches curator's `useIsMobile`), separate from
 * the app-wide `useIsMobileLayout` (1023px) — the live-room control bar crowds
 * out well before the app's general mobile layout threshold kicks in.
 */
export const MOBILE_CALL_LAYOUT_MAX_WIDTH_PX = 767;

const QUERY = `(max-width: ${MOBILE_CALL_LAYOUT_MAX_WIDTH_PX}px)`;

/** True when viewport is at most 767px wide (the live call room's mobile breakpoint). */
export function useIsMobileCallLayout() {
  return useMediaQuery(QUERY);
}
