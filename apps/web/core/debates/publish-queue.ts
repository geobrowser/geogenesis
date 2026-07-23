'use client';

/**
 * A tiny localStorage-backed queue of debate ids awaiting auto-publish to the knowledge graph.
 *
 * When a participant's debate recording finishes uploading, the debate id is enqueued here. The
 * {@link DebatePublishCoordinator} drains the queue by POSTing to the acceptor publish route, which
 * only succeeds once media processing is done, so a debate stays queued (and is retried across
 * reloads) until it is actually published.
 */
const STORAGE_KEY = 'geo:debate-publish-pending';
const CHANGE_EVENT = 'geo:debate-publish-pending-changed';

function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function enqueueDebatePublish(debateId: string): void {
  const ids = read();
  if (ids.includes(debateId)) return;
  write([...ids, debateId]);
}

export function dequeueDebatePublish(debateId: string): void {
  write(read().filter(id => id !== debateId));
}

export function listPendingDebatePublishes(): string[] {
  return read();
}

/** Subscribe to queue changes (this tab's writes plus other tabs via the storage event). */
export function observeDebatePublishQueue(onChange: (ids: string[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange(read());
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
