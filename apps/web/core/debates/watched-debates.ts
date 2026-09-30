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
}
