'use client';

import * as React from 'react';

/**
 * Call-room-specific breakpoint (matches curator's `useIsMobile`), separate from
 * the app-wide `useIsMobileLayout` (1023px) — the live-room control bar crowds
 * out well before the app's general mobile layout threshold kicks in.
 */
export const MOBILE_CALL_LAYOUT_MAX_WIDTH_PX = 767;

const QUERY = `(max-width: ${MOBILE_CALL_LAYOUT_MAX_WIDTH_PX}px)`;

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

/** True when viewport is at most 767px wide (the live call room's mobile breakpoint). */
export function useIsMobileCallLayout() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
