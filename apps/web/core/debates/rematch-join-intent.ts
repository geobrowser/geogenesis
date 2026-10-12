'use client';

const micIntentBySessionId = new Map<string, boolean>();

const MAX_REMEMBERED_SESSIONS = 20;

export function rememberRematchMicIntent(sessionId: string, micOn: boolean) {
  if (!sessionId) return;

  if (micIntentBySessionId.size >= MAX_REMEMBERED_SESSIONS && !micIntentBySessionId.has(sessionId)) {
    const oldest = micIntentBySessionId.keys().next();
    if (!oldest.done) micIntentBySessionId.delete(oldest.value);
  }
  micIntentBySessionId.set(sessionId, micOn);
}

export function readRematchMicIntent(sessionId: string): boolean | null {
  if (!sessionId) return null;
  return micIntentBySessionId.get(sessionId) ?? null;
}

/**
 * Whether this person has already answered for this session.
 */
export function hasRematchJoinChoice(sessionId: string): boolean {
  return Boolean(sessionId) && micIntentBySessionId.has(sessionId);
}

export function clearRematchJoinIntents() {
  micIntentBySessionId.clear();
}
