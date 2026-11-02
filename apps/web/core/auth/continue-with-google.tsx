'use client';

import { useCallback, useEffect, useState } from 'react';

import { type AnalyticsProperties } from '~/core/analytics';
import { useGoogleOAuthSignIn } from '~/core/auth/google-oauth';

import { GoogleMark } from '~/design-system/icons/google-mark';

type ContinueWithGoogleStatus = 'idle' | 'starting' | 'failed';

/**
 * "Continue with Google" on our own sign-in UI (GEO-3139): starts Google sign-in and remembers a
 * start that failed, so the surface can say so. `undefined` where Google is not offered, which hides
 * the button.
 */
export function useContinueWithGoogle() {
  const signIn = useGoogleOAuthSignIn();
  const [status, setStatus] = useState<ContinueWithGoogleStatus>('idle');
  // Back from Google's page can restore this one from the back/forward cache, state and all, which
  // would leave the button off with nothing left to turn it back on.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setStatus('idle');
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);
  const start = useCallback(
    async (properties: AnalyticsProperties) => {
      if (!signIn) return;
      setStatus('starting');
      try {
        // Redirects away on success, so nothing after this runs.
        await signIn(properties);
      } catch {
        setStatus('failed');
      }
    },
    [signIn]
  );
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
