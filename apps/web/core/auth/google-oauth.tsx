'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { type AnalyticsProperties } from '~/core/analytics';
import { useGoogleSignInEnabled, useGoogleSignInOffered } from '~/core/auth/google-sign-in';
import { usePrepareOnboarding } from '~/core/hooks/use-prepare-onboarding';
import { useSetToast } from '~/core/hooks/use-toast';
import { beginPrivyAuth, cancelPrivyAuth, failRedirectedPrivyAuth } from '~/core/privy-auth-events';
import { useLoginWithOAuth } from '~/core/wallet/auth-hooks';
import { isReturningFromPrivyRedirect } from '~/core/wallet/privy-session';

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
  const { initOAuth, state } = useLoginWithOAuth();
  const setToast = useSetToast();
  // Privy strips the return's parameters once it is done, so remember whether this load was one.
  const [isReturn] = useState(isReturningFromPrivyRedirect);
  // Settled once the return has failed or a new sign-in starts from this page.
  const settled = useRef(false);
  useEffect(() => {
    initGoogleOAuth = () => {
      settled.current = true;
      return initOAuth({ provider: 'google' });
    };
    return () => {
      initGoogleOAuth = null;
    };
  }, [initOAuth]);
  // A failed start rejects to its caller; only a failed return is reported here, once.
  useEffect(() => {
    if (!isReturn || settled.current || state.status !== 'error') return;
    settled.current = true;
    failRedirectedPrivyAuth();
    setToast(<>Google sign-in didn't complete. Try again.</>);
  }, [isReturn, state.status, setToast]);
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
