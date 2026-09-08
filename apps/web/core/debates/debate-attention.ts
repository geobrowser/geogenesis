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
 * Presence, unlike attention, asks only whether this tab is *open and on screen* — not whether it
 * is the frontmost window.
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
export function createDebatePresenceStore(
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

let browserAttentionStore: DebateAttentionStore | null = null;
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

function getBrowserPresenceStore() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return serverAttentionStore;
  if (!browserPresenceStore) browserPresenceStore = createDebatePresenceStore(window, document);
  return browserPresenceStore;
}

const getServerSnapshot = () => false;

/** Is the viewer actively looking at this tab? Drives polling cadence, not presence. */
export function useDebateAttention() {
  const store = getBrowserAttentionStore();
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}

/** Is this tab on screen, or recently so? Drives the gateway's `debate_presence`. */
export function useDebatePresence() {
  const store = getBrowserPresenceStore();
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}
