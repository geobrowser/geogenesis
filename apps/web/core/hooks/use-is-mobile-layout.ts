'use client';

import * as React from 'react';

/** Matches `@custom-variant lg` in styles.css (`max-width: 1023px`). */
export const MOBILE_LAYOUT_MAX_WIDTH_PX = 1023;

const QUERY = `(max-width: ${MOBILE_LAYOUT_MAX_WIDTH_PX}px)`;

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/** True when viewport is at most 1023px wide (project "mobile" / `lg:` breakpoint). */
export function useIsMobileLayout() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
