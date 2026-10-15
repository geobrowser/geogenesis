'use client';

export type DebateRematchJoinIntent = {
  micOn: boolean;
  cameraOn: boolean;
};

const joinIntentBySessionId = new Map<string, DebateRematchJoinIntent>();

const answeredSessionIds = new Set<string>();

/** Deliberately small. These only ever hold the sessions of one visit. */
const MAX_REMEMBERED_SESSIONS = 20;

export function rememberRematchJoinIntent(sessionId: string, state: DebateRematchJoinIntent) {
  if (!sessionId) return;
  // Oldest first, so a long visit cannot grow this without bound.
  if (joinIntentBySessionId.size >= MAX_REMEMBERED_SESSIONS && !joinIntentBySessionId.has(sessionId)) {
    const oldest = joinIntentBySessionId.keys().next();
    if (!oldest.done) joinIntentBySessionId.delete(oldest.value);
  }
  joinIntentBySessionId.set(sessionId, state);
}

/**
 * The same record, carried onto the debate a picker converted into.
 *
 * A picker's call is its own LiveKit room rather than the app-wide media session, so it has no
 * devices to hand the debate room — only the choice. Keyed by debate id here, because that is all
 * the room knows about where it came from.
 */
export function carryJoinIntentIntoDebate(sessionId: string, debateId: string) {
  const chosen = readRematchJoinIntent(sessionId);
  if (chosen) rememberRematchJoinIntent(debateId, chosen);
}

export function readRematchJoinIntent(sessionId: string): DebateRematchJoinIntent | null {
  if (!sessionId) return null;
  return joinIntentBySessionId.get(sessionId) ?? null;
}

export function markRematchAnswered(sessionId: string) {
  if (!sessionId) return;

  if (answeredSessionIds.size >= MAX_REMEMBERED_SESSIONS && !answeredSessionIds.has(sessionId)) {
    const oldest = answeredSessionIds.values().next();
    if (!oldest.done) answeredSessionIds.delete(oldest.value);
  }
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
