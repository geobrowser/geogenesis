'use client';

import { useMediaQuery } from '~/core/hooks/use-media-query';

/** Matches `@custom-variant lg` in styles.css (`max-width: 1023px`). */
export const MOBILE_LAYOUT_MAX_WIDTH_PX = 1023;

const QUERY = `(max-width: ${MOBILE_LAYOUT_MAX_WIDTH_PX}px)`;

/** True when viewport is at most 1023px wide (project "mobile" / `lg:` breakpoint). */
export function useIsMobileLayout() {
  return useMediaQuery(QUERY);
}
