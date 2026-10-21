'use client';

import { useLoginWithOAuth } from '@geogenesis/auth';

import { useCallback, useEffect } from 'react';

import { type AnalyticsProperties } from '~/core/analytics';
import { useGoogleSignInEnabled } from '~/core/auth/google-sign-in';
import { usePrepareOnboarding } from '~/core/hooks/use-prepare-onboarding';
import { beginPrivyAuth, cancelPrivyAuth } from '~/core/privy-auth-events';

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

/** User-agent markers from Privy 3.32.2's in-app browser check, where it refuses Google sign-in. */
const IN_APP_BROWSER_MARKERS = ['fbav', 'fban', 'instagram', 'snapchat', 'linkedinapp'];

type WebViewWindow = Window & {
  ReactNativeWebView?: unknown;
  webkit?: { messageHandlers?: { ReactNativeWebView?: unknown } };
};

/** Whether this is an in-app browser (Instagram, Facebook, LinkedIn, …), using Privy's own check. */
export function isInAppBrowser() {
  if (typeof window === 'undefined') return false;
  const webView = window as WebViewWindow;
  if (webView.ReactNativeWebView || webView.webkit?.messageHandlers?.ReactNativeWebView) return true;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return IN_APP_BROWSER_MARKERS.some(marker => userAgent.includes(marker));
}

/**
 * Starts Google sign-in from our own UI, saving the attempt first so attribution survives the redirect.
 * `undefined` with the flag off or in an in-app browser, where Privy refuses Google.
 */
export function useGoogleOAuthSignIn() {
  const enabled = useGoogleSignInEnabled();
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
  // Read only once the flag is on, which is after hydration, so the server render never differs.
  return enabled && !isInAppBrowser() ? signIn : undefined;
}
