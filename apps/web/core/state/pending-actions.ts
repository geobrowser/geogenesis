'use client';

import { useCallback } from 'react';

import { atom, useSetAtom } from 'jotai';

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

/** Enqueue an action to run once the account is ready. */
export function useEnqueuePendingAction() {
  const setActions = useSetAtom(pendingActionsAtom);
  return useCallback(
    (action: PendingAction) => {
      setActions(prev => [...prev.filter(a => a.id !== action.id), action]);
    },
    [setActions]
  );
}
