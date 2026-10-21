'use client';

import type { PrivyClientConfig } from '@geogenesis/auth';

import { isInAppBrowser } from '~/core/auth/in-app-browser';
import { useFeatureFlag } from '~/core/state/feature-flags';

type LoginMethods = NonNullable<PrivyClientConfig['loginMethods']>;

/** Per-call `login()` methods that add Google to Privy's modal. */
export const GOOGLE_SIGN_IN_METHODS: LoginMethods = ['email', 'google'];

const GOOGLE_SIGN_IN_OPTIONS = { loginMethods: GOOGLE_SIGN_IN_METHODS };

/** Whether sign-in prompts offer Google: the `googleSignIn` flag and nothing else (GEO-3139). */
export function useGoogleSignInEnabled() {
  return useFeatureFlag('googleSignIn');
}

/** Whether to offer Google here: the flag is on and this is not an in-app browser, where Google refuses OAuth. */
export function useGoogleSignInOffered() {
  // Read only once the flag is on, which is after hydration, so the server render never differs.
  return useGoogleSignInEnabled() && !isInAppBrowser();
}

/**
 * `login()` options that add Google to Privy's modal, or `undefined` to keep it email-only.
 * Google redirects, so anything queued in memory at the press is dropped; accepted while the flag gates it.
 */
export function useGoogleSignInOptions() {
  return useGoogleSignInOffered() ? GOOGLE_SIGN_IN_OPTIONS : undefined;
}
