'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { selectAtom } from 'jotai/utils';

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
   * What the action will do, for a control to draw while it waits — the side of a vote, the
   * participant picked as a debate's winner. Lives on the action rather than in the control because
   * the control can remount before the action runs (a feed reloading after onboarding) and would
   * otherwise forget what it was pressed for.
   */
  intent?: string;
};

type LiveHandler = (intent: string | undefined) => Promise<void> | void;

/**
 * Per action id, the handler of the control for it that is mounted now.
 *
 * `run` is a closure from the press, and the press is before sign-up: whatever it read from React
 * state — the personal space, the account — is from a viewer who did not have one yet. A control
 * mounted since knows them, so a replay goes through it when one is on screen, and the press's own
 * `run` only when nothing is.
 */
const liveHandlers = new Map<string, LiveHandler>();

/** Replay queued action `id` through this control while it is mounted. See `liveHandlers`. */
export function useLivePendingActionHandler(id: string, handler: LiveHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const live: LiveHandler = intent => handlerRef.current(intent);
    liveHandlers.set(id, live);
    return () => {
      if (liveHandlers.get(id) === live) liveHandlers.delete(id);
    };
  }, [id]);
}

export const pendingActionsAtom = atom<PendingAction[]>([]);

/**
 * The `intent` of queued action `id`, or undefined once it has run (or was never queued).
 *
 * Selected down to that one string so a control re-renders only when its own action changes — a
 * feed draws a vote control per row, and subscribing each to the whole queue re-rendered all of
 * them for every press anywhere.
 */
export function usePendingActionIntent(id: string) {
  const intentAtom = useMemo(
    () => selectAtom(pendingActionsAtom, actions => actions.find(a => a.id === id)?.intent),
    [id]
  );
  return useAtomValue(intentAtom);
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
          run: () =>
            withActionContext(context, () => {
              const live = liveHandlers.get(action.id);
              return live ? live(action.intent) : action.run();
            }),
        },
      ]);
    },
    [setActions, getContext]
  );
}
