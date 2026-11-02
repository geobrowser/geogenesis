'use client';

import { useMediaQuery } from '~/core/hooks/use-media-query';

/** Matches `@custom-variant md` in styles.css (`max-width: 767px`), the app's phone breakpoint. */
export const PHONE_LAYOUT_MAX_WIDTH_PX = 767;

const QUERY = `(max-width: ${PHONE_LAYOUT_MAX_WIDTH_PX}px)`;

/** True when the viewport is a phone's: at most 767px wide (the `md:` breakpoint). */
export function useIsPhoneLayout() {
  return useMediaQuery(QUERY);
}
