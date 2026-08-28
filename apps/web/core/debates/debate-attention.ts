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
 */
export function createDebatePresenceStore(windowRef: Window, documentRef: Document): DebateAttentionStore {
  let visible = documentRef.visibilityState === 'visible';
  const listeners = new Set<() => void>();

  const setVisible = (nextVisible: boolean) => {
    if (visible === nextVisible) return;
    visible = nextVisible;
    for (const listener of listeners) listener();
  };

  const reconcile = () => setVisible(documentRef.visibilityState === 'visible');
  // `pagehide` covers the back-forward cache, where `visibilitychange` alone can leave a frozen
  // page reporting itself as present.
  const hide = () => setVisible(false);

  const attach = () => {
    documentRef.addEventListener('visibilitychange', reconcile);
    windowRef.addEventListener('pagehide', hide);
    windowRef.addEventListener('pageshow', reconcile);
  };

  const detach = () => {
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
        reconcile();
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

/** Is this tab on screen at all? Drives the gateway's `debate_presence`. */
export function useDebatePresence() {
  const store = getBrowserPresenceStore();
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}
