'use client';

import * as React from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';

import { ReviewState, SpaceGovernanceType } from '~/core/types';

type Retry = (() => Promise<unknown>) | (() => unknown);

export interface StatusBarState {
  reviewState: ReviewState;
  error: string | null;
  retry?: Retry;
  /**
   * Where the publish is going, so the toast can name what actually happened: writing to your own
   * space publishes, while writing to a DAO space files a proposal for the space to decide on.
   */
  spaceGovernanceType: SpaceGovernanceType | null;
}

export type StatusBarActions =
  | {
      type: 'SET_REVIEW_STATE';
      payload: ReviewState;
      /** Carried through the publish so the completion message can match the destination. */
      spaceGovernanceType?: SpaceGovernanceType;
    }
  | { type: 'ERROR'; payload: string | null; retry?: Retry };

// Jotai-backed global state. Lives outside of React's reducer so any module
// (hooks, helpers, even non-React code that grabs the default jotai store)
// can dispatch into the toast pattern without needing context.
const reviewStateAtom = atom<ReviewState>('idle');
const errorAtom = atom<string | null>(null);
const retryAtom = atom<Retry | undefined>(undefined);
const spaceGovernanceTypeAtom = atom<SpaceGovernanceType | null>(null);

export const statusBarStateAtom = atom<StatusBarState>(get => ({
  reviewState: get(reviewStateAtom),
  error: get(errorAtom),
  retry: get(retryAtom),
  spaceGovernanceType: get(spaceGovernanceTypeAtom),
}));

export const statusBarDispatchAtom = atom(null, (_get, set, action: StatusBarActions) => {
  switch (action.type) {
    case 'SET_REVIEW_STATE':
      set(reviewStateAtom, action.payload);
      set(errorAtom, null);
      set(retryAtom, undefined);
      // Only the dispatches that know the destination carry it, and the rest of a publish's states
      // must not wipe what an earlier one established. Returning to idle does clear it, so the next
      // publish can't inherit the last one's wording.
      if (action.spaceGovernanceType !== undefined) {
        set(spaceGovernanceTypeAtom, action.spaceGovernanceType);
      } else if (action.payload === 'idle') {
        set(spaceGovernanceTypeAtom, null);
      }
      return;
    case 'ERROR':
      set(reviewStateAtom, 'publish-error');
      set(errorAtom, action.payload);
      // Wrap in a thunk: jotai treats a bare function value as a state UPDATER and
      // calls it immediately, storing its return value. Passing `action.retry`
      // directly therefore *invoked* the retry at dispatch time and left a Promise
      // in the atom. For a write that fails deterministically that is an infinite
      // loop — fail, dispatch, auto-retry, fail — and the StatusBar then renders
      // onClick={Promise}. This cost us ~125 duplicate subspace submissions.
      set(retryAtom, () => action.retry);
      return;
  }
});

/**
 * Subscribe to the global status-bar state. Returns the same `{ state, dispatch }`
 * shape the original reducer-backed hook returned, so existing call sites work
 * unchanged.
 */
export function useStatusBar() {
  const state = useAtomValue(statusBarStateAtom);
  const dispatch = useSetAtom(statusBarDispatchAtom);
  return { state, dispatch };
}

/**
 * One-liner for raising an error into the global status bar.
 *
 * Use this anywhere you currently render an inline red error message — the
 * global StatusBar pill will surface the message with a copy-to-clipboard
 * affordance that includes diagnostics for the dev team.
 */
export function useReportError() {
  const dispatch = useSetAtom(statusBarDispatchAtom);
  return React.useCallback(
    (message: string, retry?: Retry) => {
      dispatch({ type: 'ERROR', payload: message, retry });
    },
    [dispatch]
  );
}
