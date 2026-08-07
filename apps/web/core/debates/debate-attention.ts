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

let browserAttentionStore: DebateAttentionStore | null = null;
const serverAttentionStore: DebateAttentionStore = {
  getSnapshot: () => false,
  subscribe: () => () => undefined,
};

function getBrowserAttentionStore() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return serverAttentionStore;
  if (!browserAttentionStore) browserAttentionStore = createDebateAttentionStore(window, document);
  return browserAttentionStore;
}

const getServerSnapshot = () => false;

export function useDebateAttention() {
  const store = getBrowserAttentionStore();
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}
