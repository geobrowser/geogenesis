'use client';

import * as React from 'react';

import { atom, useSetAtom, useStore } from 'jotai';

import { type ActionContext, withActionContext } from '~/core/action-context';
import { useActionContext } from '~/core/action-context-provider';
import { currentAuthAttempt, readAuthAttempt } from '~/core/auth-attempt';

/**
 * Space ids a signed-out user asked to join before authenticating.
 */
export const pendingJoinIntentsAtom = atom<string[]>([]);
const pendingJoinContextsAtom = atom<Record<string, ActionContext>>({});

/** Record that a signed-out user asked to join `spaceId` (no optimistic UI — just the intent). */
export function useAddPendingJoinIntent() {
  const getContext = useActionContext('join_space_button', 'space', '');
  const store = useStore();
  const setIntents = useSetAtom(pendingJoinIntentsAtom);
  return React.useCallback(
    (spaceId: string) => {
      store.set(pendingJoinContextsAtom, prev => ({
        ...prev,
        [spaceId]: {
          ...getContext({ target_type: 'space', target_id: spaceId }),
          auth_attempt_id: currentAuthAttempt()?.id,
        },
      }));
      setIntents(prev => (prev.includes(spaceId) ? prev : [...prev, spaceId]));
    },
    [setIntents, store, getContext]
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
    const attempt = context?.auth_attempt_id ? readAuthAttempt(context.auth_attempt_id) : undefined;
    if (attempt?.outcome === 'closed' || attempt?.outcome === 'superseded') return;
    if (context) withActionContext(context, submit);
    else submit();
  }, [isAuthenticated, spaceId, store, submit]);

  return React.useCallback(() => addIntent(spaceId), [addIntent, spaceId]);
}
