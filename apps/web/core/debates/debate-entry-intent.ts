'use client';

import * as React from 'react';

/**
 * The debate this tab is on its way into.
 *
 * Accepting a request creates the debate and pushes straight into its room, a server segment whose
 * payload can take seconds to arrive on a cold route. The same `onSuccess` invalidates activity,
 * which comes back long before the room does. In between, the accepting tab is a tab with an active
 * debate sitting on some other path, which is exactly the shape `DebateCoordinator` reads as "this
 * person has not been told their debate is ready" — so it reopened the very dialog they had just
 * accepted from, with the buttons swapped, and took it away again when the room finally landed. That
 * is the flicker.
 *
 * Recording the intent here closes the gap: a debate this tab is walking into counts as one it is
 * already in, for as long as the walk takes. The room's `loading` boundary shortens that walk — the
 * pathname now commits as soon as the spinner shows rather than when the payload lands — but does
 * not remove it, and `DebateCoordinator` releases the intent at exactly that pathname change, where
 * `atDebate` takes over.
 */

/**
 * Long enough for a cold room route, short enough that a push which never lands does not cost the
 * viewer their way in permanently — the rejoin bar is the fallback for exactly that, and it is
 * suppressed while an intent is held.
 */
const ENTRY_INTENT_TIMEOUT_MS = 30_000;

let enteringDebateId: string | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function set(debateId: string | null) {
  if (expiry) {
    clearTimeout(expiry);
    expiry = null;
  }
  if (enteringDebateId === debateId) return;
  enteringDebateId = debateId;
  emit();
}

/** Call immediately before pushing into a debate room. */
export function markEnteringDebate(debateId: string) {
  set(debateId);
  expiry = setTimeout(() => {
    expiry = null;
    set(null);
  }, ENTRY_INTENT_TIMEOUT_MS);
}

/** Pass an id to release only that intent, so a later accept is never cleared by an earlier arrival. */
export function clearEnteringDebate(debateId?: string) {
  if (debateId !== undefined && enteringDebateId !== debateId) return;
  set(null);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => enteringDebateId;
const getServerSnapshot = () => null;

export function useEnteringDebateId() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
