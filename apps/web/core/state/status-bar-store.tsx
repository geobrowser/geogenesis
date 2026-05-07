'use client';

import { atom, useAtomValue, useSetAtom } from 'jotai';

import { ReviewState } from '~/core/types';

type Retry = (() => Promise<unknown>) | (() => unknown);

export interface StatusBarState {
  reviewState: ReviewState;
  error: string | null;
  retry?: Retry;
}

export type StatusBarActions =
  | {
      type: 'SET_REVIEW_STATE';
      payload: ReviewState;
    }
  | { type: 'ERROR'; payload: string | null; retry?: Retry };

// Jotai-backed global state. Lives outside of React's reducer so any module
// (hooks, helpers, even non-React code that grabs the default jotai store)
// can dispatch into the toast pattern without needing context.
const reviewStateAtom = atom<ReviewState>('idle');
const errorAtom = atom<string | null>(null);
const retryAtom = atom<Retry | undefined>(undefined);

export const statusBarStateAtom = atom<StatusBarState>(get => ({
  reviewState: get(reviewStateAtom),
  error: get(errorAtom),
  retry: get(retryAtom),
}));

export const statusBarDispatchAtom = atom(null, (_get, set, action: StatusBarActions) => {
  switch (action.type) {
    case 'SET_REVIEW_STATE':
      set(reviewStateAtom, action.payload);
      set(errorAtom, null);
      set(retryAtom, undefined);
      return;
    case 'ERROR':
      set(reviewStateAtom, 'publish-error');
      set(errorAtom, action.payload);
      set(retryAtom, action.retry);
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
  return (message: string, retry?: Retry) => {
    dispatch({ type: 'ERROR', payload: message, retry });
  };
}
