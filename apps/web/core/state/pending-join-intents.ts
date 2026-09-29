'use client';
import * as React from 'react';

import { atom, useSetAtom, useStore } from 'jotai';

import { type ActionContext, snapshotActionContext, withActionContext } from '~/core/action-context';

/**
 * Space ids a signed-out user asked to join before authenticating.
 */
export const pendingJoinIntentsAtom = atom<string[]>([]);
const pendingJoinContextsAtom = atom<Record<string, ActionContext>>({});

/** Record that a signed-out user asked to join `spaceId` (no optimistic UI — just the intent). */
export function useAddPendingJoinIntent() {
  const store = useStore();
  const setIntents = useSetAtom(pendingJoinIntentsAtom);
  return React.useCallback(
    (spaceId: string) => {
      store.set(pendingJoinContextsAtom, prev => ({
        ...prev,
        [spaceId]: snapshotActionContext('join_space_button', 'space', spaceId),
      }));
      setIntents(prev => (prev.includes(spaceId) ? prev : [...prev, spaceId]));
    },
    [setIntents, store]
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
    const context = store.get(pendingJoinContextsAtom)[spaceId];
    store.set(pendingJoinContextsAtom, prev => {
      const next = { ...prev };
      delete next[spaceId];
      return next;
    });
    if (context) withActionContext(context, submit);
    else submit();
  }, [isAuthenticated, spaceId, store, submit]);

  return React.useCallback(() => addIntent(spaceId), [addIntent, spaceId]);
}
