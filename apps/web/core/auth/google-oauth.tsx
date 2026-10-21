'use client';

import { useCallback, useEffect } from 'react';

import { type AnalyticsProperties } from '~/core/analytics';
import { useGoogleSignInEnabled, useGoogleSignInOffered } from '~/core/auth/google-sign-in';
import { usePrepareOnboarding } from '~/core/hooks/use-prepare-onboarding';
import { beginPrivyAuth, cancelPrivyAuth } from '~/core/privy-auth-events';
import { useLoginWithOAuth } from '~/core/wallet/auth-hooks';

/** Set while `GoogleOAuthCompleter` is mounted. */
let initGoogleOAuth: (() => Promise<void>) | null = null;

/**
 * Mounted only with the `googleSignIn` flag on, so flag off mounts no OAuth hook. The flag is in
 * localStorage, so it is still on when the redirect returns; Privy completes once this mounts.
 */
export function GoogleOAuthHost() {
  return useGoogleSignInEnabled() ? <GoogleOAuthCompleter /> : null;
}

/**
 * Privy completes a headless OAuth sign-in in every `useLoginWithOAuth` mounted on the return page,
 * so exactly one is mounted app-wide; a second would race the code exchange.
 */
function GoogleOAuthCompleter() {
  const { initOAuth } = useLoginWithOAuth();
  useEffect(() => {
    initGoogleOAuth = () => initOAuth({ provider: 'google' });
    return () => {
      initGoogleOAuth = null;
    };
  }, [initOAuth]);
  return null;
}

/**
 * Starts Google sign-in from our own UI, saving the attempt first so attribution survives the redirect.
 * `undefined` with the flag off or in an in-app browser, where Privy refuses Google.
 */
export function useGoogleOAuthSignIn() {
  const offered = useGoogleSignInOffered();
  const prepareOnboarding = usePrepareOnboarding();
  const signIn = useCallback(
    async (properties: AnalyticsProperties) => {
      prepareOnboarding();
      beginPrivyAuth(properties);
      try {
        if (!initGoogleOAuth) throw new Error('Google sign-in is not mounted');
        await initGoogleOAuth();
      } catch (error) {
        cancelPrivyAuth();
        throw error;
      }
    },
    [prepareOnboarding]
  );
  return offered ? signIn : undefined;
}
