/**
 * Elects one announcer per response, so the confirming sentence is spoken once when the same claim
 * is on screen in several controls at once. The first to register for a key wins; the rest stay
 * silent; the next takes over if it unmounts. Module-level so it spans every surface without a
 * provider above them all.
 */

type AnnouncerId = symbol;

const idsByKey = new Map<string, AnnouncerId[]>();
const listenersByKey = new Map<string, Set<() => void>>();

export function responseAnnouncerKey(entityId: string, spaceId: string, responseKind: string): string {
  return `${spaceId}:${entityId}:${responseKind}`;
}

function notify(key: string) {
  const listeners = listenersByKey.get(key);
  if (!listeners) return;
  for (const listener of listeners) listener();
}

export function registerResponseAnnouncer(key: string, id: AnnouncerId): void {
  const ids = idsByKey.get(key);
  if (ids) {
    if (ids.includes(id)) return;
    ids.push(id);
  } else {
    idsByKey.set(key, [id]);
  }
  notify(key);
}

export function unregisterResponseAnnouncer(key: string, id: AnnouncerId): void {
  const ids = idsByKey.get(key);
  if (!ids) return;
  const next = ids.filter(existing => existing !== id);
  if (next.length > 0) idsByKey.set(key, next);
  else idsByKey.delete(key);
  notify(key);
}

export function isResponseAnnouncer(key: string, id: AnnouncerId): boolean {
  return idsByKey.get(key)?.[0] === id;
}

export function subscribeResponseAnnouncer(key: string, listener: () => void): () => void {
  let listeners = listenersByKey.get(key);
  if (!listeners) {
    listeners = new Set();
    listenersByKey.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    const current = listenersByKey.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listenersByKey.delete(key);
  };
}
