'use client';

import { useCallback } from 'react';

import { atom, useSetAtom } from 'jotai';

import { type ActionComponent, withActionContext } from '../action-context';
import { useActionContext } from '../action-context-provider';

/**
 * Queue of actions a user took before their account was ready
 */
export type PendingActionRequirement = 'auth' | 'personalSpace';

export type PendingAction = {
  id: string;
  label: string;
  requires: PendingActionRequirement;
  run: () => Promise<void> | void;
};

export const pendingActionsAtom = atom<PendingAction[]>([]);

/** Drop a queued action that will no longer be wanted — its sign-in was abandoned, say. */
export function useDequeuePendingAction() {
  const setActions = useSetAtom(pendingActionsAtom);
  return useCallback((id: string) => setActions(prev => prev.filter(a => a.id !== id)), [setActions]);
}

/** Enqueue an action to run once the account is ready. */
export function useEnqueuePendingAction(component: ActionComponent = 'entity_vote_buttons') {
  const setActions = useSetAtom(pendingActionsAtom);
  const getContext = useActionContext(component, 'entity', '');
  return useCallback(
    (action: PendingAction) => {
      const context = getContext();
      setActions(prev => [
        ...prev.filter(a => a.id !== action.id),
        {
          ...action,
          run: () => withActionContext(context, action.run),
        },
      ]);
    },
    [setActions, getContext]
  );
}
