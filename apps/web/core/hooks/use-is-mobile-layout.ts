'use client';

import * as React from 'react';

/** Matches `@custom-variant lg` in styles.css (`max-width: 1023px`). */
export const MOBILE_LAYOUT_MAX_WIDTH_PX = 1023;

/** Matches `@custom-variant md` in styles.css (`max-width: 767px`). */
export const MD_LAYOUT_MAX_WIDTH_PX = 767;

function getServerSnapshot() {
  return false;
}

function mediaQueryStore(query: string) {
  return {
    subscribe(onStoreChange: () => void) {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onStoreChange);
      return () => mq.removeEventListener('change', onStoreChange);
    },
    getSnapshot() {
      if (typeof window.matchMedia !== 'function') return false;
      return window.matchMedia(query).matches;
    },
  };
}

const mobileStore = mediaQueryStore(`(max-width: ${MOBILE_LAYOUT_MAX_WIDTH_PX}px)`);
const mdStore = mediaQueryStore(`(max-width: ${MD_LAYOUT_MAX_WIDTH_PX}px)`);

/** True when viewport is at most 1023px wide (project "mobile" / `lg:` breakpoint). */
export function useIsMobileLayout() {
  return React.useSyncExternalStore(mobileStore.subscribe, mobileStore.getSnapshot, getServerSnapshot);
}

/**
 * True when viewport is at most 767px wide (the `md:` breakpoint).
 */
export function useIsMdLayout() {
  return React.useSyncExternalStore(mdStore.subscribe, mdStore.getSnapshot, getServerSnapshot);
}
