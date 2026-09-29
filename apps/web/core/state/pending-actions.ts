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
  authAttemptId?: string;
  requires: PendingActionRequirement;
  run: () => Promise<void> | void;
};

export const pendingActionsAtom = atom<PendingAction[]>([]);

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
          authAttemptId: action.authAttemptId ?? context.auth_attempt_id,
          run: () => withActionContext(context, action.run),
        },
      ]);
    },
    [setActions, getContext]
  );
}
