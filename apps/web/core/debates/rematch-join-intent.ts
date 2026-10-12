'use client';

const micIntentBySessionId = new Map<string, boolean>();

const answeredSessionIds = new Set<string>();

/** Deliberately small. These only ever hold the sessions of one visit. */
const MAX_REMEMBERED_SESSIONS = 20;

function evict(sessionId: string) {
  // Oldest first, so a long visit cannot grow this without bound.
  if (micIntentBySessionId.size >= MAX_REMEMBERED_SESSIONS && !micIntentBySessionId.has(sessionId)) {
    const oldest = micIntentBySessionId.keys().next();
    if (!oldest.done) micIntentBySessionId.delete(oldest.value);
  }
}

export function rememberRematchMicIntent(sessionId: string, micOn: boolean) {
  if (!sessionId) return;
  evict(sessionId);
  micIntentBySessionId.set(sessionId, micOn);
}

export function readRematchMicIntent(sessionId: string): boolean | null {
  if (!sessionId) return null;
  return micIntentBySessionId.get(sessionId) ?? null;
}

export function markRematchAnswered(sessionId: string) {
  if (!sessionId) return;
  answeredSessionIds.add(sessionId);
}

/**
 * Whether this person is done with the card.
 */
export function hasAnsweredRematchJoin(sessionId: string): boolean {
  return Boolean(sessionId) && answeredSessionIds.has(sessionId);
}

export function clearRematchJoinIntents() {
  micIntentBySessionId.clear();
  answeredSessionIds.clear();
}
