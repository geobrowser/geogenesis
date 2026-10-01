'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { atom, useAtomValue, useSetAtom, useStore } from 'jotai';
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
  /**
   * The press's own way to carry the action out, used when no control for it is mounted (see
   * `liveHandlers`). Omitted for an action only a mounted control can perform; the runner then
   * waits for one to mount.
   */
  run?: () => Promise<void> | void;
  /**
   * What the action will do, for a control to draw while it waits — the side of a vote, the
   * participant picked as a debate's winner. Lives on the action rather than in the control because
   * the control can remount before the action runs (a feed reloading after onboarding) and would
   * otherwise forget what it was pressed for.
   */
  intent?: string;
};

/** A queued action as the runner sees it: always runnable. */
type RunnablePendingAction = PendingAction & { run: () => Promise<void> | void };

/** A live handler's answer when its control unmounted before it could act: try another. */
const HANDLER_GONE = Symbol('handler gone');

type LiveHandler = (intent: string | undefined) => Promise<void | typeof HANDLER_GONE> | void;

/**
 * Per action id, the handlers of the controls for it that are mounted now — the latest last.
 *
 * `run` is a closure from the press, and the press is before sign-up: whatever it read from React
 * state — the personal space, the account — is from a viewer who did not have one yet. A control
 * mounted since knows them, so a replay goes through it when one is on screen, and the press's own
 * `run` only when nothing is.
 *
 * A list rather than one handler because one action can have several controls at once — the same
 * claim in the feed and in the side panel — and closing one must not drop the other.
 */
const liveHandlers = new Map<string, LiveHandler[]>();
/** Replays waiting for a control to mount, for actions queued without a `run`. */
const liveHandlerWaiters = new Map<string, ((handler: LiveHandler) => void)[]>();

function currentLiveHandler(id: string) {
  return liveHandlers.get(id)?.at(-1);
}

function waitForLiveHandler(id: string) {
  return new Promise<LiveHandler>(resolve => {
    const handler = currentLiveHandler(id);
    if (handler) resolve(handler);
    else liveHandlerWaiters.set(id, [...(liveHandlerWaiters.get(id) ?? []), resolve]);
  });
}

/**
 * Registers this control as a live handler for `id` (see `liveHandlers`).
 *
 * A replay waits for `ready` before running: the control decides from data of its own — whether the
 * viewer already holds this side, already applied — and right after sign-in that data is still
 * loading, its defaults reading as "no". If the control unmounts while the replay waits, it answers
 * `HANDLER_GONE` and the queue tries another.
 */
function useLivePendingActionHandler(
  id: string,
  handler: (intent: string | undefined) => Promise<void> | void,
  ready: boolean
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const readyWaiters = useRef<((outcome: 'ready' | 'gone') => void)[]>([]);

  useEffect(() => {
    if (!ready) return;
    const waiting = readyWaiters.current;
    readyWaiters.current = [];
    waiting.forEach(resolve => resolve('ready'));
  }, [ready]);

  useEffect(() => {
    const live: LiveHandler = async intent => {
      if (!readyRef.current) {
        const outcome = await new Promise<'ready' | 'gone'>(resolve => readyWaiters.current.push(resolve));
        if (outcome === 'gone') return HANDLER_GONE;
      }
      return handlerRef.current(intent);
    };
    liveHandlers.set(id, [...(liveHandlers.get(id) ?? []), live]);
    const waiters = liveHandlerWaiters.get(id);
    liveHandlerWaiters.delete(id);
    waiters?.forEach(resolve => resolve(live));
    return () => {
      const remaining = (liveHandlers.get(id) ?? []).filter(h => h !== live);
      if (remaining.length > 0) liveHandlers.set(id, remaining);
      else liveHandlers.delete(id);
      const waiting = readyWaiters.current;
      readyWaiters.current = [];
      waiting.forEach(resolve => resolve('gone'));
    };
  }, [id]);
}

export const pendingActionsAtom = atom<RunnablePendingAction[]>([]);

/**
 * The `intent` of queued action `id`, or undefined once it has run (or was never queued).
 *
 * Selected down to that one string so a control re-renders only when its own action changes — a
 * feed draws a vote control per row, and subscribing each to the whole queue re-rendered all of
 * them for every press anywhere.
 */
function usePendingActionIntent(id: string) {
  const intentAtom = useMemo(
    () => selectAtom(pendingActionsAtom, actions => actions.find(a => a.id === id)?.intent),
    [id]
  );
  return useAtomValue(intentAtom);
}

/** Enqueue an action to run once the account is ready. */
export function useEnqueuePendingAction(component: ActionComponent = 'entity_vote_buttons') {
  const setActions = useSetAtom(pendingActionsAtom);
  const store = useStore();
  const getContext = useActionContext(component, 'entity', '');
  return useCallback(
    (action: PendingAction) => {
      const context = getContext();
      const queued: RunnablePendingAction = {
        ...action,
        run: async () => {
          // Until a control carries it out, or none is left to and the press's own `run` does.
          for (;;) {
            // Withdrawn, or replaced by a newer press, while it waited.
            if (!store.get(pendingActionsAtom).includes(queued)) return;
            const live = currentLiveHandler(action.id);
            if (!live && action.run) return withActionContext(context, action.run);
            const handler = live ?? (await waitForLiveHandler(action.id));
            const outcome = await withActionContext(context, () => handler(action.intent));
            if (outcome !== HANDLER_GONE) return;
          }
        },
      };
      setActions(prev => [...prev.filter(a => a.id !== action.id), queued]);
    },
    [setActions, store, getContext]
  );
}

/**
 * A control's action, held in the queue until the account can carry it out.
 *
 * The one hook every sign-up-gated control shares: `queue` at the press (with the intent the control
 * draws while it waits), `cancel` when the sign-in is dismissed or the press is taken back, and
 * `intent` to draw from — read off the queue, so it survives this control remounting. `run` performs
 * the action; the control that is mounted when the account is ready is the one whose `run` is used.
 *
 * `liveOnly` for an action whose `run` cannot work from the press's closure at all: with no control
 * mounted then, it waits for one rather than running stale. `ready` holds a replay until the control
 * on screen can tell what it should do.
 */
export function useQueuedAction({
  id,
  component,
  label,
  run,
  requires = 'personalSpace',
  liveOnly = false,
  ready = true,
}: {
  id: string;
  component: ActionComponent;
  label: string;
  run: (intent: string | undefined) => Promise<void> | void;
  requires?: PendingActionRequirement;
  liveOnly?: boolean;
  /**
   * Whether this control's own data — what `run` decides from — has loaded. A replay through this
   * control waits for it, so `run` never reads a loading default as an answer.
   */
  ready?: boolean;
}) {
  const enqueue = useEnqueuePendingAction(component);
  const setActions = useSetAtom(pendingActionsAtom);
  const intent = usePendingActionIntent(id);
  const runRef = useRef(run);
  runRef.current = run;
  useLivePendingActionHandler(id, nextIntent => runRef.current(nextIntent), ready);

  const queue = useCallback(
    (nextIntent: string = 'queued') =>
      enqueue({
        id,
        label,
        requires,
        intent: nextIntent,
        run: liveOnly ? undefined : () => runRef.current(nextIntent),
      }),
    [enqueue, id, label, requires, liveOnly]
  );

  const cancel = useCallback(() => setActions(prev => prev.filter(a => a.id !== id)), [setActions, id]);

  return { intent, isQueued: intent !== undefined, queue, cancel };
}
