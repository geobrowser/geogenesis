'use client';

import { useCallback } from 'react';

import { atom, useSetAtom } from 'jotai';

import { type AnalyticsProperties } from '~/core/analytics';

export type DeferredSignIn = {
  actionId: string;
  analytics: AnalyticsProperties;
};

/**
 * App-level, beside the queued action rather than in the control that queued it: the control can
 * unmount before sign-in resolves — a popover closed — and the prompt has to outlive it the way the
 * action does. Otherwise a signed-out viewer is left with a request nothing ever sends, drawn as made
 * wherever its control reappears.
 */
export const deferredSignInAtom = atom<DeferredSignIn[]>([]);

/** Ask for an account once sign-in resolves, if it resolves signed out. */
export function useDeferSignIn() {
  const setDeferred = useSetAtom(deferredSignInAtom);
  return useCallback(
    (entry: DeferredSignIn) => setDeferred(prev => [...prev.filter(e => e.actionId !== entry.actionId), entry]),
    [setDeferred]
  );
}
