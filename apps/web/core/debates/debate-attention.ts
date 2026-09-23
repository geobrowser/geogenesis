'use client';

import * as React from 'react';

const DEFAULT_BLUR_GRACE_MS = 3_000;

type DebateAttentionStore = {
  getSnapshot(): boolean;
  subscribe(listener: () => void): () => void;
};

export function createDebateAttentionStore(
  windowRef: Window,
  documentRef: Document,
  blurGraceMs = DEFAULT_BLUR_GRACE_MS
): DebateAttentionStore {
  let active = documentRef.visibilityState === 'visible' && documentRef.hasFocus();
  let blurTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const setActive = (nextActive: boolean) => {
    if (active === nextActive) return;
    active = nextActive;
    for (const listener of listeners) listener();
  };

  const clearBlurTimer = () => {
    if (!blurTimer) return;
    clearTimeout(blurTimer);
    blurTimer = null;
  };

  const deactivate = () => {
    clearBlurTimer();
    setActive(false);
  };

  const handleVisibilityChange = () => {
    if (documentRef.visibilityState !== 'visible') {
      deactivate();
      return;
    }
    if (documentRef.hasFocus()) {
      clearBlurTimer();
      setActive(true);
    }
  };

  const handleFocus = () => {
    clearBlurTimer();
    if (documentRef.visibilityState === 'visible' && documentRef.hasFocus()) setActive(true);
  };

  const handleBlur = () => {
    if (documentRef.visibilityState !== 'visible') {
      deactivate();
      return;
    }
    clearBlurTimer();
    blurTimer = setTimeout(() => {
      blurTimer = null;
      if (documentRef.visibilityState === 'visible' && !documentRef.hasFocus()) setActive(false);
    }, blurGraceMs);
  };

  const attach = () => {
    documentRef.addEventListener('visibilitychange', handleVisibilityChange);
    windowRef.addEventListener('focus', handleFocus);
    windowRef.addEventListener('blur', handleBlur);
    windowRef.addEventListener('pagehide', deactivate);
    windowRef.addEventListener('pageshow', handleFocus);
  };

  const detach = () => {
    clearBlurTimer();
    documentRef.removeEventListener('visibilitychange', handleVisibilityChange);
    windowRef.removeEventListener('focus', handleFocus);
    windowRef.removeEventListener('blur', handleBlur);
    windowRef.removeEventListener('pagehide', deactivate);
    windowRef.removeEventListener('pageshow', handleFocus);
  };

  return {
    getSnapshot: () => active,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        attach();
        clearBlurTimer();
        setActive(documentRef.visibilityState === 'visible' && documentRef.hasFocus());
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) detach();
      };
    },
  };
}

const DEFAULT_HIDE_GRACE_MS = 60_000;

/**
 * Presence uses a longer grace than polling cadence does, because the cost of being wrong is not
 * symmetric: a poll that pauses for a minute too long costs nothing, while dropping someone from
 * matchmaking costs them a debate and costs the requester a reply that never comes.
 *
 * Three minutes is long enough that checking a calendar, reading a notification or answering a
 * message does not take you out of the pool, and short enough that a closed laptop leaves it while
 * the person is still plausibly coming back. It is deliberately a number to tune from evidence
 * rather than a derived constant — measure before shortening it.
 */
const PRESENCE_HIDE_GRACE_MS = 180_000;

/**
 * Is this tab on screen, or recently so?
 *
 * **This is no longer presence** (GEO-2849). It gates *polling cadence* — a hidden tab should stop
 * refetching — and nothing else. What geo-chat is told about `is_online` comes from
 * `createDebateConnectionPresenceStore` below, for reasons recorded there.
 *
 * Unlike attention, this asks only whether the tab is open and on screen, not whether it is the
 * frontmost window.
 *
 * The gateway reports this as `debate_presence`, and geo-chat turns it into `is_online`, which
 * gates two things that must not depend on where the pointer happens to be: who appears in
 * `/matchmaking/people`, and whose pending requests survive in a recipient's inbox (incoming
 * requests from an offline requester are filtered out). Keying either on focus meant a request
 * disappeared the moment its requester clicked into another window, well inside its 25-minute
 * lifetime — and, with several browsers open on one machine, only ever one user could be online.
 *
 * Hiding the tab is graced rather than acted on at once (GEO-2836). Visibility is a much sharper
 * signal than the thing it stands in for: checking a calendar in another tab for ten seconds is
 * not leaving, but it used to report as leaving, and the report was immediate because the gateway
 * flushes a heartbeat on every presence transition. Someone who is about to come back should not
 * vanish from other people's matchmaking lists in the meantime.
 *
 * Closing the tab is *not* graced. `pagehide` drops presence at once, so the case a grace would
 * genuinely get wrong — offering a debate to someone who has already gone — keeps its explicit
 * signal, and the grace only ever covers a tab that is still there.
 */
export function createDebateVisibilityStore(
  windowRef: Window,
  documentRef: Document,
  hideGraceMs = DEFAULT_HIDE_GRACE_MS
): DebateAttentionStore {
  let visible = documentRef.visibilityState === 'visible';
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const setVisible = (nextVisible: boolean) => {
    if (visible === nextVisible) return;
    visible = nextVisible;
    for (const listener of listeners) listener();
  };

  const clearHideTimer = () => {
    if (!hideTimer) return;
    clearTimeout(hideTimer);
    hideTimer = null;
  };

  const reconcile = () => {
    if (documentRef.visibilityState === 'visible') {
      clearHideTimer();
      setVisible(true);
      return;
    }
    // Already counting down, or already gone: either way the deadline stands as it is. Restarting
    // it on each `visibilitychange` would let a tab that keeps waking briefly never expire.
    if (hideTimer || !visible) return;
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (documentRef.visibilityState !== 'visible') setVisible(false);
    }, hideGraceMs);
  };

  // `pagehide` covers the back-forward cache, where `visibilitychange` alone can leave a frozen
  // page reporting itself as present. It is also the one departure we can be sure of, so unlike a
  // plain hide it takes effect immediately.
  const hide = () => {
    clearHideTimer();
    setVisible(false);
  };

  const attach = () => {
    documentRef.addEventListener('visibilitychange', reconcile);
    windowRef.addEventListener('pagehide', hide);
    windowRef.addEventListener('pageshow', reconcile);
  };

  const detach = () => {
    clearHideTimer();
    documentRef.removeEventListener('visibilitychange', reconcile);
    windowRef.removeEventListener('pagehide', hide);
    windowRef.removeEventListener('pageshow', reconcile);
  };

  return {
    getSnapshot: () => visible,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        attach();
        // A store nobody was listening to ran no timer, so the grace does not apply across the
        // gap: settle on what the document says now.
        clearHideTimer();
        setVisible(documentRef.visibilityState === 'visible');
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) detach();
      };
    },
  };
}

/**
 * Presence: is this tab still here?
 *
 * **Not currently wired to anything (2026-09-23).** `useDebatePresence` reads a visibility store
 * again — see the note there for why, and the trade that was accepted. Kept, with its tests, so
 * putting it back is a one-line change in `getBrowserPresenceStore` rather than a rewrite.
 *
 * True for the whole life of the document, false only once it is genuinely going away.
 *
 * **This used to be tab visibility, and that broke every onboarding call (GEO-2849).** On a video
 * call nobody's browser tab is the frontmost window — people are looking at Zoom, or presenting —
 * so every participant reported hidden, flipped to offline, and vanished from everyone else's
 * matchmaking at the same moment. Measured during one: a participant with 38 matchable claims saw
 * none of them, and zero debate requests were created across a call with nine people online.
 *
 * GEO-2836 gave visibility a 60-second grace, which fixed tab-switching and could never fix this:
 * the participant who reported it was 79.6 seconds hidden, and a call lasts an hour.
 *
 * The honest signal is the socket. A tab that is open and heartbeating is present — hiding it is
 * not leaving, and treating the two as the same thing is what made someone invisible while they
 * were sitting in front of the product being shown how to use it.
 *
 * `pagehide` remains the departure signal, and it is the *right* one: it fires on close, on
 * navigation and into the back-forward cache, which are the cases where the person really is gone.
 * `pageshow` restores, so a bfcache restore does not strand a live tab as absent.
 */
export function createDebateConnectionPresenceStore(windowRef: Window, documentRef: Document): DebateAttentionStore {
  // Starts present: the document is executing this, so the tab exists.
  let present = true;
  const listeners = new Set<() => void>();

  const setPresent = (next: boolean) => {
    if (present === next) return;
    present = next;
    for (const listener of listeners) listener();
  };

  const hide = () => setPresent(false);
  // Deliberately not `visibilitychange`. A hidden tab is still here; see the note above.
  const show = () => setPresent(true);

  const attach = () => {
    windowRef.addEventListener('pagehide', hide);
    windowRef.addEventListener('pageshow', show);
  };
  const detach = () => {
    windowRef.removeEventListener('pagehide', hide);
    windowRef.removeEventListener('pageshow', show);
  };

  return {
    getSnapshot: () => present,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        attach();
        // A store nobody was listening to ran no handlers; the document is alive if we are here.
        setPresent(documentRef.defaultView !== null);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) detach();
      };
    },
  };
}

let browserAttentionStore: DebateAttentionStore | null = null;
let browserVisibilityStore: DebateAttentionStore | null = null;
let browserPresenceStore: DebateAttentionStore | null = null;
const serverAttentionStore: DebateAttentionStore = {
  getSnapshot: () => false,
  subscribe: () => () => undefined,
};

function getBrowserAttentionStore() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return serverAttentionStore;
  if (!browserAttentionStore) browserAttentionStore = createDebateAttentionStore(window, document);
  return browserAttentionStore;
}

function getBrowserVisibilityStore() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return serverAttentionStore;
  if (!browserVisibilityStore) browserVisibilityStore = createDebateVisibilityStore(window, document);
  return browserVisibilityStore;
}

function getBrowserPresenceStore() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return serverAttentionStore;
  // Its own instance, not the polling store: they read the same signal but must keep separate
  // graces, and sharing would silently give polling the presence grace.
  if (!browserPresenceStore)
    browserPresenceStore = createDebateVisibilityStore(window, document, PRESENCE_HIDE_GRACE_MS);
  return browserPresenceStore;
}

const getServerSnapshot = () => false;

/** Is the viewer actively looking at this tab? Drives polling cadence, not presence. */
export function useDebateAttention() {
  const store = getBrowserAttentionStore();
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}

/**
 * Is this tab on screen, or recently so? Gates **polling cadence** — not presence (GEO-2849).
 */
export function useDebateVisibility() {
  const store = getBrowserVisibilityStore();
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}

/**
 * Is the viewer here? Drives the gateway's `debate_presence`, and therefore `is_online`.
 *
 * **Visibility, with a three-minute grace — this reverses GEO-2849, deliberately.** That change
 * made presence mean "a tab is open and heartbeating", which is true of an abandoned tab forever:
 * `last_seen_at` never goes stale, so the 90-second server window never elapses and people sit in
 * the matchmaking pool indefinitely. Yaniv requested debates from several such ghosts and got no
 * reply in an hour; Preston reported the same and called it the bigger problem of the two.
 *
 * The cost is the case GEO-2849 was written for: someone on a call with this tab hidden reads as
 * away after the grace, and an onboarding call is an hour of hidden tab. There is no exemption
 * available for it — the call happens in another app, so this tab cannot know. Accepted knowingly
 * as a product call by Preston, on the grounds that a pool full of ghosts hurts continuously while
 * the call case is occasional and has a workaround (keep the tab visible).
 *
 * `createDebateConnectionPresenceStore` is kept, unused, so reverting is a one-line change.
 */
export function useDebatePresence() {
  const store = getBrowserPresenceStore();
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}
