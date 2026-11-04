'use client';

import { useSyncExternalStore } from 'react';

import { type AnalyticsProperties } from '~/core/analytics';

/** One opening of the sign-in box, made by `useTrackedLogin` at the press. */
export type SignInBoxRequest = {
  /** The attempt the press began; a new request replaces the box. */
  attemptId: string;
  /** The attempt's attribution, reported with every step. */
  attribution: { readonly component: string } & AnalyticsProperties;
  /** Overrides the default heading, for an entry with its own ask (a lobby link, say). */
  heading?: string;
  /** The address to start from: a code step picked up again (GEO-3573). */
  prefillEmail?: string;
  /** The attempt ended signed in. */
  onComplete?: () => void;
  /** Closed without signing in. */
  onDismiss?: () => void;
};

let current: SignInBoxRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export function openSignInBox(request: SignInBoxRequest) {
  current = request;
  emit();
}

/** Closes the box if `attemptId` is still the one it shows, or whatever it shows when omitted. */
export function closeSignInBox(attemptId?: string) {
  if (!current || (attemptId !== undefined && current.attemptId !== attemptId)) return;
  current = null;
  emit();
}

export function readSignInBox() {
  return current;
}

/** Whether the box is up, for surfaces that step aside while it is (the save-votes sheet). */
export function isSignInBoxOpen() {
  return current !== null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useSignInBoxRequest() {
  return useSyncExternalStore(subscribe, readSignInBox, () => null);
}
