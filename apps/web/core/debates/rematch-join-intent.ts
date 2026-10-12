'use client';

import type { DebateJoinState } from './request-join-state';

const joinIntentBySessionId = new Map<string, DebateJoinState>();

const answeredSessionIds = new Set<string>();

/** Deliberately small. These only ever hold the sessions of one visit. */
const MAX_REMEMBERED_SESSIONS = 20;

export function rememberRematchJoinIntent(sessionId: string, state: DebateJoinState) {
  if (!sessionId) return;
  // Oldest first, so a long visit cannot grow this without bound.
  if (joinIntentBySessionId.size >= MAX_REMEMBERED_SESSIONS && !joinIntentBySessionId.has(sessionId)) {
    const oldest = joinIntentBySessionId.keys().next();
    if (!oldest.done) joinIntentBySessionId.delete(oldest.value);
  }
  joinIntentBySessionId.set(sessionId, state);
}

export function readRematchJoinIntent(sessionId: string): DebateJoinState | null {
  if (!sessionId) return null;
  return joinIntentBySessionId.get(sessionId) ?? null;
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

/** Test seam. Nothing in the app forgets either of these; a reload is what clears them. */
export function clearRematchJoinIntents() {
  joinIntentBySessionId.clear();
  answeredSessionIds.clear();
}
