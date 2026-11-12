'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { useStore } from 'jotai';

import { type AnalyticsProperties } from '~/core/analytics';
import { currentAuthAttempt, tagAuthAttempt } from '~/core/auth-attempt';
import { type SignInSurface, authErrorCode } from '~/core/auth/auth-step-switch';
import { captureAuthStep } from '~/core/auth/code-step';
import { useGoogleSignInEnabled, useGoogleSignInOffered } from '~/core/auth/google-sign-in';
import { readSignInBox } from '~/core/auth/sign-in-box/sign-in-box-store';
import { usePrepareOnboarding } from '~/core/hooks/use-prepare-onboarding';
import { useSetToast } from '~/core/hooks/use-toast';
import { beginPrivyAuth, cancelPrivyAuth, failRedirectedPrivyAuth } from '~/core/privy-auth-events';
import { redirectedPendingActions, restorePendingActions } from '~/core/state/pending-actions';
import {
  dropRedirectPendingActions,
  saveRedirectPendingActions,
  takeRedirectPendingActions,
} from '~/core/state/redirect-pending-actions';
import { useLoginWithOAuth, usePrivy } from '~/core/wallet/auth-hooks';
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
  // Privy strips the return's parameters once it is done, so remember whether this load was one, and
  // which attempt it returned to: a sign-in started meanwhile replaces that one.
  const [isReturn] = useState(isReturningFromPrivyRedirect);
  const [returnAttemptId] = useState(() => (isReturn ? currentAuthAttempt()?.id : undefined));
  // Settled once the return has failed or a new sign-in starts from this page.
  const settled = useRef(false);
  useRedirectPendingActions(isReturn, returnAttemptId, settled);
  useEffect(() => {
    initGoogleOAuth = () => {
      settled.current = true;
      return initOAuth({ provider: 'google' });
    };
    return () => {
      initGoogleOAuth = null;
    };
  }, [initOAuth]);
  const returnError = state.status === 'error' ? state.error : undefined;
  // A failed start rejects to its caller; only a failed return is reported here, once.
  useEffect(() => {
    if (!isReturn || settled.current || state.status !== 'error') return;
    settled.current = true;
    if (returnAttemptId) {
      const authError = authErrorCode(returnError);
      tagAuthAttempt(returnAttemptId, { lastAuthError: authError });
      if (currentAuthAttempt()?.id === returnAttemptId)
        captureAuthStep('google_failed', { sign_in_method: 'google', auth_error: authError });
      failRedirectedPrivyAuth(returnAttemptId);
    }
    dropRedirectPendingActions();
    setToast(<>Google sign-in didn't complete. Try again.</>);
  }, [isReturn, returnAttemptId, state.status, returnError, setToast]);
  return null;
}

/**
 * Keeps the presses queued before a Google sign-in across its redirect (see
 * `redirect-pending-actions`), whether it was started from Privy's dialog or our sign-in box.
 *
 * Saved as the page is left, under the attempt open then: the redirect gives no other notice, and a
 * press can be queued after the attempt opens. Brought back on the return to that attempt, once
 * someone is signed in — never into a queue for a visitor the return left signed out. A failed
 * return, or a load that is not a return, forgets them.
 */
function useRedirectPendingActions(
  isReturn: boolean,
  returnAttemptId: string | undefined,
  settled: RefObject<boolean>
) {
  const store = useStore();
  const { authenticated } = usePrivy();

  useEffect(() => {
    if (!isReturn) dropRedirectPendingActions();
  }, [isReturn]);

  useEffect(() => {
    const save = () => {
      const attempt = currentAuthAttempt();
      if (attempt && !attempt.endedAt) saveRedirectPendingActions(attempt.id, redirectedPendingActions(store));
    };
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [store]);

  const restored = useRef(false);
  useEffect(() => {
    if (!isReturn || !returnAttemptId || !authenticated || restored.current || settled.current) return;
    restored.current = true;
    restorePendingActions(store, takeRedirectPendingActions(returnAttemptId));
  }, [isReturn, returnAttemptId, authenticated, settled, store]);
}

/** Where a Google start comes from. */
export type GoogleStartOptions = {
  surface?: SignInSurface;
  /** An open attempt to carry on, rather than start a new one: our sign-in box's, so its press hears the outcome. */
  attemptId?: string;
};

/**
 * Starts Google sign-in from our own UI, saving the attempt first so attribution survives the redirect.
 * `undefined` with the flag off or in an in-app browser, where Privy refuses Google.
 */
export function useGoogleOAuthSignIn() {
  const offered = useGoogleSignInOffered();
  const prepareOnboarding = usePrepareOnboarding();
  const signIn = useCallback(
    async (properties: AnalyticsProperties, { surface, attemptId }: GoogleStartOptions = {}) => {
      const open = currentAuthAttempt();
      const resumed = attemptId && open?.id === attemptId && !open.endedAt ? open : undefined;
      // A resumed press already set onboarding and its return address.
      if (!resumed) prepareOnboarding();
      const attempt = resumed ?? beginPrivyAuth(properties);
      tagAuthAttempt(attempt.id, { signInMethod: 'google', ...(surface ? { signInSurface: surface } : {}) });
      captureAuthStep('google_started', { sign_in_method: 'google' });
      try {
        if (!initGoogleOAuth) throw new Error('Google sign-in is not mounted');
        await initGoogleOAuth();
      } catch (error) {
        // A newer email or Google sign-in may have replaced this request while it was starting.
        if (currentAuthAttempt()?.id === attempt.id) {
          const authError = authErrorCode(error);
          tagAuthAttempt(attempt.id, { lastAuthError: authError });
          captureAuthStep('google_failed', { sign_in_method: 'google', auth_error: authError });
          // A resumed attempt stays open while the box still shows it, to say the start failed and
          // offer email. Closed meanwhile, nothing else would end it.
          if (!resumed || readSignInBox()?.attemptId !== attempt.id) cancelPrivyAuth();
        }
        throw error;
      }
    },
    [prepareOnboarding]
  );
  return offered ? signIn : undefined;
}
