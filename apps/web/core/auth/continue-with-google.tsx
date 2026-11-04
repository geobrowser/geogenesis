'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { type AnalyticsProperties } from '~/core/analytics';
import { type SignInSurface } from '~/core/auth/auth-step-switch';
import { useGoogleOAuthSignIn } from '~/core/auth/google-oauth';

import { GoogleMark } from '~/design-system/icons/google-mark';

type ContinueWithGoogleStatus = 'idle' | 'starting' | 'failed';

// Both signup surfaces can mount, close and reopen while the same redirect is starting.
// Its ownership outlives either hook instance; releasing it on unmount would allow a second start.
type GoogleStart = { id: symbol; pending: boolean };
let currentStart: GoogleStart | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = () => listeners.forEach(listener => listener());
const readStart = () => currentStart;
const serverStart = () => null;

/** Read in account-action handlers too: a press can precede React's next render. */
export const isGoogleSignInStarting = () => currentStart?.pending === true;

/**
 * "Continue with Google" on our own sign-in UI (GEO-3139): starts Google sign-in and remembers a
 * start that failed, so the surface can say so. `undefined` where Google is not offered, which hides
 * the button.
 */
export function useContinueWithGoogle() {
  const signIn = useGoogleOAuthSignIn();
  const sharedStart = useSyncExternalStore(subscribe, readStart, serverStart);
  const [failedStart, setFailedStart] = useState<symbol | null>(null);
  // Back from Google's page can restore this one from the back/forward cache, state and all, which
  // would leave the button off with nothing left to turn it back on.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      currentStart = null;
      setFailedStart(null);
      emit();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
  const start = useCallback(
    async (properties: AnalyticsProperties, surface?: SignInSurface) => {
      if (!signIn || isGoogleSignInStarting()) return;
      const request = Symbol();
      currentStart = { id: request, pending: true };
      setFailedStart(null);
      emit();
      try {
        // Redirects away on success, so nothing after this runs.
        await signIn(properties, surface);
      } catch {
        if (currentStart?.id !== request) return;
        currentStart = { id: request, pending: false };
        setFailedStart(request);
        emit();
      }
    },
    [signIn]
  );
  // A failure belongs to this surface's request, and a newer shared request retires it.
  const status: ContinueWithGoogleStatus = sharedStart?.pending
    ? 'starting'
    : failedStart !== null && failedStart === sharedStart?.id
      ? 'failed'
      : 'idle';
  return signIn ? { start, status } : undefined;
}

/** The button itself, with Google's mark; each surface sizes it. Off while the redirect is starting. */
export function ContinueWithGoogleButton({
  status,
  onClick,
  className,
}: {
  status: ContinueWithGoogleStatus;
  onClick: () => void;
  className: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={status === 'starting'} className={className}>
      <GoogleMark />
      Continue with Google
    </button>
  );
}
