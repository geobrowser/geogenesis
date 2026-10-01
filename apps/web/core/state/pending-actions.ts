'use client';

import { useCallback } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';

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
  /**
   * The response a queued vote will publish, for a control to draw while it waits. Lives on the
   * action rather than in the control because the control can remount before the action runs — a
   * feed reloading after onboarding — and would otherwise forget the side it was pressed on.
   */
  direction?: 'positive' | 'negative';
};

export const pendingActionsAtom = atom<PendingAction[]>([]);

/** The queued action with this id, if it has not run yet. */
export function usePendingAction(id: string) {
  const actions = useAtomValue(pendingActionsAtom);
  return actions.find(a => a.id === id);
}

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
