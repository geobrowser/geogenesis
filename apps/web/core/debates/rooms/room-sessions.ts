'use client';

import * as React from 'react';

/** Sessions a room handed this tab, so the coordinator can tell one it must not route on from a challenge's. */
const roomSessionIds = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: readonly string[] = [];

function publish() {
  snapshot = [...roomSessionIds];
  listeners.forEach(listener => listener());
}

export function rememberRoomSession(sessionId: string) {
  if (roomSessionIds.has(sessionId)) return;
  roomSessionIds.add(sessionId);
  publish();
}

export function isRoomSession(sessionId: string | null | undefined) {
  return sessionId != null && roomSessionIds.has(sessionId);
}

/** Test seam. */
export function clearRoomSessions() {
  if (roomSessionIds.size === 0) return;
  roomSessionIds.clear();
  publish();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the reader when a room hands out a session it had not seen. */
export function useRoomSessionIds(): readonly string[] {
  return React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot
  );
}
