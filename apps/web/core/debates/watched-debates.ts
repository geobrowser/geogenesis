import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

/**
 * Debates this browser has watched to the end, so "watch another debate" can offer one the viewer
 * has not seen.
 *
 * Per browser rather than per account. Nothing server-side records a finished debate today, and a
 * recommendation is a convenience: forgetting it on a new device costs one repeat suggestion, where
 * a new endpoint would cost a backend change for the same result.
 *
 * Plain `localStorage` behind try/catch rather than a jotai storage atom. A module-level atom runs
 * on import, which under jsdom breaks every suite that imports the player just as
 * `core/state/pending-personal-space` does; this only touches storage when it is called.
 */
const STORAGE_KEY = 'geogenesis.debates.watched.v1';

/**
 * Oldest dropped past this. A viewer who has finished hundreds of debates is not helped by the
 * first of them being remembered, and the list is parsed each time a debate ends.
 */
const MAX_REMEMBERED = 500;

export function readWatchedDebateIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markDebateWatched(debateId: string): void {
  if (typeof window === 'undefined') return;
  const id = normId(debateId);
  try {
    // Most recent last, so trimming from the front forgets the oldest.
    const ids = [...readWatchedDebateIds()].filter(existing => existing !== id);
    ids.push(id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_REMEMBERED)));
  } catch {
    // Quota or private mode: the next recommendation may repeat, which is all this was preventing.
  }
  for (const listener of listeners) listener();
}

const listeners = new Set<() => void>();

/**
 * Told whenever the watched list changes — in this tab, or in another one (the `storage` event only
 * fires for writes made elsewhere, which is exactly the half a listener here would otherwise miss).
 */
export function subscribeToWatchedDebates(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The watched list, kept current.
 *
 * Subscribed rather than read at a moment of the caller's choosing: an ended end card stays on
 * screen as the feed scrolls on, and the debate it suggests can be finished further down without
 * anything about the card itself changing. Only the list can say so.
 */
export function useWatchedDebateIds(): ReadonlySet<string> {
  return React.useSyncExternalStore(subscribeToWatchedDebates, watchedSnapshot, serverSnapshot);
}

// `useSyncExternalStore` wants the same object back until something changed, so the parsed set is
// cached against the raw string it came from.
let cachedRaw: string | null | undefined;
let cachedSet: ReadonlySet<string> = new Set();
const EMPTY: ReadonlySet<string> = new Set();

function watchedSnapshot(): ReadonlySet<string> {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSet = readWatchedDebateIds();
  }
  return cachedSet;
}

function serverSnapshot(): ReadonlySet<string> {
  return EMPTY;
}
