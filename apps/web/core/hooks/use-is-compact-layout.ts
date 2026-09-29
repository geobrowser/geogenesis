'use client';

import * as React from 'react';

/**
 * Matches `@custom-variant md` in styles.css (`max-width: 767px`) — the width at which surfaces
 * that go full-bleed on phones actually do so.
 *
 * Distinct from the app-wide `useIsMobileLayout` (1023px), which is the sidebar's threshold: a
 * viewport can be "mobile" by that measure while a full-bleed surface is still laid out as
 * desktop, so the two are not interchangeable.
 */
export const COMPACT_LAYOUT_MAX_WIDTH_PX = 767;

const QUERY = `(max-width: ${COMPACT_LAYOUT_MAX_WIDTH_PX}px)`;

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

/** True when the viewport is at most 767px wide (the project's `md:` breakpoint). */
export function useIsCompactLayout() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
