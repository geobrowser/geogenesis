'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Whether the Explore email capture card is on screen (GEO-3214).
 *
 * It and the save-votes sheet are the same card in the same corner, and neither is a dialog, so the
 * overlay checks each one makes cannot see the other. The capture card says when it is up; the save
 * sheet waits behind it, as it waits behind anything else the visitor has open. Module-level for the
 * same reason as `core/state/local-votes`: no jotai in the navbar's import graph.
 */
let showing = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(change: number) {
  showing += change;
  listeners.forEach(listener => listener());
}

/** Mounted inside the capture card: it is showing for as long as this is mounted. */
export function useMarkEmailCaptureShowing() {
  useEffect(() => {
    set(1);
    return () => set(-1);
  }, []);
}

export function useIsEmailCaptureShowing() {
  return useSyncExternalStore(
    subscribe,
    () => showing > 0,
    () => false
  );
}
