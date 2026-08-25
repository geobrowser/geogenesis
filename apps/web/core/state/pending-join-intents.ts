'use client';

import * as React from 'react';

import { atom, useSetAtom, useStore } from 'jotai';

/**
 * Space ids a signed-out user asked to join before authenticating.
 */
export const pendingJoinIntentsAtom = atom<string[]>([]);

/** Record that a signed-out user asked to join `spaceId` (no optimistic UI — just the intent). */
export function useAddPendingJoinIntent() {
  const setIntents = useSetAtom(pendingJoinIntentsAtom);
  return React.useCallback(
    (spaceId: string) => {
      setIntents(prev => (prev.includes(spaceId) ? prev : [...prev, spaceId]));
    },
    [setIntents]
  );
}

/**
 * Wires the deferred-join lifecycle for a single join button.
 */
export function useDeferredJoin(spaceId: string, isAuthenticated: boolean, submit: () => void) {
  const store = useStore();
  const addIntent = useAddPendingJoinIntent();

  React.useEffect(() => {
    if (!isAuthenticated) return;
    if (!store.get(pendingJoinIntentsAtom).includes(spaceId)) return;
    store.set(pendingJoinIntentsAtom, prev => prev.filter(id => id !== spaceId));
    submit();
  }, [isAuthenticated, spaceId, store, submit]);

  return React.useCallback(() => addIntent(spaceId), [addIntent, spaceId]);
}
