'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { type AnalyticsProperties } from '~/core/analytics';
import { useGoogleOAuthSignIn } from '~/core/auth/google-oauth';

import { GoogleMark } from '~/design-system/icons/google-mark';

type ContinueWithGoogleStatus = 'idle' | 'starting' | 'failed';

// Both signup surfaces can mount, close and reopen while the same redirect is starting.
// Its ownership outlives either hook instance; releasing it on unmount would allow a second start.
let pendingStart: symbol | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = () => listeners.forEach(listener => listener());

/** Read in account-action handlers too: a press can precede React's next render. */
export const isGoogleSignInStarting = () => pendingStart !== null;

/**
 * "Continue with Google" on our own sign-in UI (GEO-3139): starts Google sign-in and remembers a
 * start that failed, so the surface can say so. `undefined` where Google is not offered, which hides
 * the button.
 */
export function useContinueWithGoogle() {
  const signIn = useGoogleOAuthSignIn();
  const starting = useSyncExternalStore(subscribe, isGoogleSignInStarting, () => false);
  const [failed, setFailed] = useState(false);
  // Back from Google's page can restore this one from the back/forward cache, state and all, which
  // would leave the button off with nothing left to turn it back on.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      pendingStart = null;
      setFailed(false);
      emit();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
  const start = useCallback(
    async (properties: AnalyticsProperties) => {
      if (!signIn || isGoogleSignInStarting()) return;
      const request = Symbol();
      pendingStart = request;
      setFailed(false);
      emit();
      try {
        // Redirects away on success, so nothing after this runs.
        await signIn(properties);
      } catch {
        if (pendingStart !== request) return;
        pendingStart = null;
        setFailed(true);
        emit();
      }
    },
    [signIn]
  );
  const status: ContinueWithGoogleStatus = starting ? 'starting' : failed ? 'failed' : 'idle';
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
