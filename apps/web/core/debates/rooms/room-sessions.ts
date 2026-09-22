'use client';

import * as React from 'react';

/** Sessions a room handed out, so the coordinator can tell one from a challenge's. Cross-tab,
 * because `activity.rematch` reports a room's session in tabs that never opened the room. */
const storageKey = 'geo.debates.room-sessions';

const listeners = new Set<() => void>();
let snapshot: readonly string[] = read();

function read(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // Privacy modes and SSR. Forgetting only un-suppresses a redirect, which is the safe failure.
    return [];
  }
}

function publish(next: readonly string[]) {
  snapshot = next;
  listeners.forEach(listener => listener());
}

export function rememberRoomSession(sessionId: string) {
  if (snapshot.includes(sessionId)) return;
  // Bounded: a viewer accumulates one id per room they enter, and the oldest go first.
  const next = [...snapshot, sessionId].slice(-50);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Still held in memory for this tab.
  }
  publish(next);
}

/** Reads storage rather than the snapshot, which is only as fresh as the last subscriber event. */
export function isRoomSession(sessionId: string | null | undefined) {
  return sessionId != null && (snapshot.includes(sessionId) || read().includes(sessionId));
}

/** Test seam. */
export function clearRoomSessions() {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
  publish([]);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // `storage` fires in the *other* tabs, which is the point: the tab that opened the room is not
  // the one that needs telling.
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) publish(read());
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const EMPTY: readonly string[] = [];

/** Re-renders the reader when any tab learns of a room's session. */
export function useRoomSessionIds(): readonly string[] {
  return React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY
  );
}
