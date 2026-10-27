import { normId } from '~/core/utils/norm-id';

/**
 * What this browser has shown its visitor on Explore, and what they engaged with (GEO-3234).
 *
 * Kept in localStorage under one key, per entity: the times its card was shown (at most one per page
 * view, the newest {@link MAX_VIEWS_PER_ENTITY}) and the last time the visitor clicked anything on
 * it. Entries untouched for {@link RETENTION_DAYS} days are dropped and at most
 * {@link MAX_ENTITIES} are kept, the most recently active.
 *
 * Cost, because this sits beside the feed:
 * - **One read per session.** The first {@link SeenStore.snapshot} parses the key and keeps the
 *   result; {@link SeenStore.prime} does that in an idle callback as the feed mounts, so it is
 *   normally done before the first page arrives. The feed decides with that snapshot for the rest
 *   of the session, so cards never move under a reader because they were just seen.
 * - **Writes off the render path.** Impressions and engagements are queued in memory and written
 *   together in an idle callback (or on `pagehide`). The write re-reads the key first, so two tabs
 *   add to each other rather than overwrite.
 * - **No storage, no feature.** Private mode, a blocked or full store: every call is a no-op and
 *   the snapshot is null, which the feed reads as "do nothing".
 */

export const SEEN_STORAGE_KEY = 'geo.explore.seen.v1';
export const MAX_ENTITIES = 2_000;
export const RETENTION_DAYS = 7;
export const MAX_VIEWS_PER_ENTITY = 10;
const DAY_SEC = 86_400;

export type SeenEntry = {
  /** Unix seconds of each view, oldest first. */
  views: number[];
  /** Unix seconds of the last engagement, if any. */
  engagedAt: number | null;
};

export type SeenSnapshot = ReadonlyMap<string, SeenEntry>;

type StoredEntry = { s: number[]; g?: number };
type Stored = { v: 1; e: Record<string, StoredEntry> };

type Event = { kind: 'view' | 'engage'; id: string; at: number };

export type SeenStoreDeps = {
  /** Returns the storage to use, or throws / returns null when there is none. */
  storage: () => Pick<Storage, 'getItem' | 'setItem'> | null;
  nowSec: () => number;
  /** Runs a task when the browser is idle. */
  schedule: (task: () => void) => void;
};

function decode(raw: string | null): Map<string, SeenEntry> {
  const entries = new Map<string, SeenEntry>();
  if (!raw) return entries;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return entries;
  }
  const record = (parsed as Partial<Stored> | null)?.e;
  if (!record || typeof record !== 'object') return entries;
  for (const [id, value] of Object.entries(record)) {
    if (!value || !Array.isArray(value.s)) continue;
    const views = value.s.filter((at): at is number => typeof at === 'number' && Number.isFinite(at));
    const engagedAt = typeof value.g === 'number' && Number.isFinite(value.g) ? value.g : null;
    entries.set(id, { views, engagedAt });
  }
  return entries;
}

function encode(entries: ReadonlyMap<string, SeenEntry>): string {
  const e: Record<string, StoredEntry> = {};
  for (const [id, entry] of entries)
    e[id] = entry.engagedAt === null ? { s: entry.views } : { s: entry.views, g: entry.engagedAt };
  return JSON.stringify({ v: 1, e } satisfies Stored);
}

function lastActivity(entry: SeenEntry): number {
  return Math.max(entry.views[entry.views.length - 1] ?? 0, entry.engagedAt ?? 0);
}

/**
 * Drops what is older than the retention window, keeps the newest views of each entity, and keeps
 * the {@link MAX_ENTITIES} most recently active entities. Pure.
 */
export function pruneSeenEntries(entries: ReadonlyMap<string, SeenEntry>, nowSec: number): Map<string, SeenEntry> {
  const cutoff = nowSec - RETENTION_DAYS * DAY_SEC;
  const kept: [string, SeenEntry][] = [];
  for (const [id, entry] of entries) {
    const views = entry.views.filter(at => at >= cutoff).slice(-MAX_VIEWS_PER_ENTITY);
    const engagedAt = entry.engagedAt !== null && entry.engagedAt >= cutoff ? entry.engagedAt : null;
    if (views.length === 0 && engagedAt === null) continue;
    kept.push([id, { views, engagedAt }]);
  }
  if (kept.length > MAX_ENTITIES) {
    kept.sort((a, b) => lastActivity(b[1]) - lastActivity(a[1]));
    kept.length = MAX_ENTITIES;
  }
  return new Map(kept);
}

function applyEvents(entries: Map<string, SeenEntry>, events: readonly Event[]) {
  for (const event of events) {
    const entry = entries.get(event.id) ?? { views: [], engagedAt: null };
    if (event.kind === 'view') {
      entry.views = [...entry.views, event.at].sort((a, b) => a - b);
    } else {
      entry.engagedAt = Math.max(entry.engagedAt ?? 0, event.at);
    }
    entries.set(event.id, entry);
  }
}

/**
 * Whether a card should move down: shown at least `minViews` times in the last `days` days and not
 * engaged with in the retention window. Engagement exempts a card however often it was shown.
 */
export function isSeenWithoutEngagement(
  snapshot: SeenSnapshot,
  entityId: string,
  config: { minViews: number; days: number },
  nowSec: number
): boolean {
  const entry = snapshot.get(normId(entityId));
  if (!entry || entry.engagedAt !== null) return false;
  const since = nowSec - config.days * DAY_SEC;
  let count = 0;
  for (const at of entry.views) if (at >= since) count += 1;
  return count >= config.minViews;
}

export type SeenStore = {
  /** Loads the store once and keeps it; null when there is no usable storage. */
  snapshot: () => SeenSnapshot | null;
  /** Loads the snapshot when the browser is next idle, so the feed never waits on it. */
  prime: () => void;
  /** One view per entity per page view; repeated calls in the same page view are ignored. */
  recordImpression: (entityId: string, pageViewId: string) => void;
  recordEngagement: (entityId: string) => void;
  /** Writes whatever is queued now. */
  flush: () => void;
};

export function createSeenStore(deps: SeenStoreDeps): SeenStore {
  // undefined: not read yet. null: no storage.
  let loaded: Map<string, SeenEntry> | null | undefined;
  let queue: Event[] = [];
  let scheduled = false;
  let viewedPage = '';
  const viewedThisPage = new Set<string>();

  const storage = () => {
    try {
      return deps.storage();
    } catch {
      return null;
    }
  };

  const snapshot = (): SeenSnapshot | null => {
    if (loaded !== undefined) return loaded;
    const store = storage();
    if (!store) return (loaded = null);
    try {
      loaded = pruneSeenEntries(decode(store.getItem(SEEN_STORAGE_KEY)), deps.nowSec());
    } catch {
      loaded = null;
    }
    return loaded;
  };

  const flush = () => {
    scheduled = false;
    if (queue.length === 0) return;
    const events = queue;
    queue = [];
    const store = storage();
    if (!store) return;
    try {
      // Re-read, so another tab's writes since this one loaded are kept.
      const entries = decode(store.getItem(SEEN_STORAGE_KEY));
      applyEvents(entries, events);
      store.setItem(SEEN_STORAGE_KEY, encode(pruneSeenEntries(entries, deps.nowSec())));
    } catch {
      // Full or blocked: drop this batch. Seen demotion is a nicety, never worth an error.
    }
  };

  const enqueue = (event: Event) => {
    queue.push(event);
    if (scheduled) return;
    scheduled = true;
    deps.schedule(flush);
  };

  return {
    snapshot,
    prime: () => {
      if (loaded === undefined) deps.schedule(() => void snapshot());
    },
    recordImpression: (entityId, pageViewId) => {
      if (pageViewId !== viewedPage) {
        viewedPage = pageViewId;
        viewedThisPage.clear();
      }
      const id = normId(entityId);
      if (!id || viewedThisPage.has(id)) return;
      viewedThisPage.add(id);
      enqueue({ kind: 'view', id, at: deps.nowSec() });
    },
    recordEngagement: entityId => {
      const id = normId(entityId);
      if (id) enqueue({ kind: 'engage', id, at: deps.nowSec() });
    },
    flush,
  };
}

function scheduleIdle(task: () => void) {
  if (typeof window === 'undefined') return;
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(task, { timeout: 2_000 });
  else window.setTimeout(task, 200);
}

let browserStore: SeenStore | null = null;

/** The browser's store; a no-op store on the server. */
export function seenStore(): SeenStore {
  if (browserStore) return browserStore;
  const store = createSeenStore({
    storage: () => (typeof window === 'undefined' ? null : window.localStorage),
    nowSec: () => Math.floor(Date.now() / 1000),
    schedule: scheduleIdle,
  });
  if (typeof window !== 'undefined') {
    // The queue is in memory: write it before the page goes away.
    window.addEventListener('pagehide', () => store.flush());
    browserStore = store;
  }
  return store;
}
