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

/**
 * Where the viewer was before they entered the debate flow.
 *
 * GEO-2605: exiting a debate used `router.back()`, which steps back exactly one
 * history entry. In a single-hop entry that is the origin, but the flow is rarely
 * single-hop — hub -> room -> rematch -> room means the entry behind you is
 * another room, so back() lands inside the flow and the fallback drops you on
 * `/space/{id}/debates`, which is the "weird screen" in the report. The room's own
 * comment already noted the other half of it: stepping back into a room re-runs
 * its exit from a fresh mount, which is the flicker.
 *
 * So record the origin on the way in instead of inferring it on the way out.
 *
 * Captured on `markEnteringDebate`, which every entry into a room already calls,
 * and deliberately *only if nothing is held yet* — a rematch entering a second
 * room must not overwrite the hub the viewer actually came from. Paths already
 * inside the flow are never recorded, so a refresh mid-flow cannot make the room
 * its own origin.
 *
 * `sessionStorage` rather than module state because "errored out of the flow" can
 * mean a reload, and module state does not survive one. Scoped to the tab, so two
 * debates in two tabs keep separate origins.
 *
 * Every exit through the room consumes the origin, so it only goes stale if the
 * viewer leaves the flow some other way (a nav click) and later re-enters from a
 * different page. They then land on the earlier origin instead of the newer one —
 * still a page they were on in this tab, so not worth a route observer to fix.
 */
const DEBATE_FLOW_ORIGIN_KEY = 'geo.debate-flow-origin';

/** True for any path that is itself part of the debate flow. */
function isDebateFlowPath(path: string): boolean {
  return /\/debates(\/|$|\?)/.test(path);
}

function currentPath(): string | null {
  if (typeof window === 'undefined') return null;
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * Remember where the flow started. No-op if an origin is already held, if the
 * current path is inside the flow, or off the browser.
 */
export function recordDebateFlowOrigin(path: string | null = currentPath()): void {
  if (typeof window === 'undefined' || !path || isDebateFlowPath(path)) return;
  try {
    if (window.sessionStorage.getItem(DEBATE_FLOW_ORIGIN_KEY)) return;
    window.sessionStorage.setItem(DEBATE_FLOW_ORIGIN_KEY, path);
  } catch {
    // Private-mode or storage-disabled browsers fall back to the old behaviour.
  }
}

/** Read and forget the origin. Returns null when there is nothing to return to. */
export function takeDebateFlowOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const origin = window.sessionStorage.getItem(DEBATE_FLOW_ORIGIN_KEY);
    window.sessionStorage.removeItem(DEBATE_FLOW_ORIGIN_KEY);
    return origin || null;
  } catch {
    return null;
  }
}

/** Call immediately before pushing into a debate room. */
export function markEnteringDebate(debateId: string) {
  recordDebateFlowOrigin();
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
