'use client';

import { useGeoLogin } from '@geogenesis/auth';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import { type AnalyticsProperties, trackPrivyAuth } from '~/core/analytics';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

type UsePrivySignInOptions = {
  /**
   * Where to send the viewer once they are through. Defaults to the page they are on, which is
   * right for a control they pressed. A deep link overrides it, because the URL that carried them
   * here still holds the trigger that opened this dialog and replaying it would reopen the dialog.
   */
  redirectTo?: string;
  /**
   * Merged into the login event — attribution for a sign-in that started off-site, say. Snapshot
   * when the viewer presses, not when Privy finishes, which can be minutes later on a different
   * URL.
   */
  analytics?: AnalyticsProperties;
};

/**
 * Opens Privy's own "Log in or sign up" dialog straight away, the way the upvote control does.
 *
 * The alternative, `SignInPrompt`, shows a "create your personal space" card first — which costs
 * the viewer a second click and paints a tinted overlay over the page on the way. For a control
 * whose only barrier is "you are signed out", going directly to the login is the shorter path.
 *
 * Clears any half-finished onboarding first, and records where to return to so the viewer lands
 * back on the page they left rather than being bounced to explore.
 */
export function usePrivySignIn(onComplete?: () => void, options?: UsePrivySignInOptions) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  // Held in a ref so callers can pass an inline closure without re-creating the returned callback
  // on every render — `castVote` and the feed's button handler both depend on its identity.
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Held for the same reason, so a caller can pass an inline object literal.
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  // Privy fires `onComplete` on session restoration too, not just on a login someone asked for —
  // opening a second tab is enough (see the note in `core/wallet/wallet.tsx`). So the consumer's
  // callback is armed here and only fires for a sign-in this hook actually started. Without it,
  // loading the feed in a new tab would open the hub with nobody having pressed anything.
  const requestedRef = React.useRef(false);

  // The attribution belongs to the attempt, not to whatever the page looks like when Privy
  // finishes. A deep link clears its own params the moment it opens the dialog, so by the time
  // someone has typed an emailed code the current render no longer knows where they came from.
  // Taken at the press, spent on completion.
  const requestedAnalyticsRef = React.useRef<AnalyticsProperties | undefined>(undefined);

  const { login } = useGeoLogin({
    onComplete: args => {
      // Only a sign-in this hook started is a login. An unrequested completion is a session
      // restore, which `AnalyticsUserIdentifier` already reports as one — tracking it here as
      // `manual_login` made every page load carrying this hook look like somebody signing in.
      if (!requestedRef.current) return;
      requestedRef.current = false;

      trackPrivyAuth(args, { auth_flow: 'manual_login', ...requestedAnalyticsRef.current });
      requestedAnalyticsRef.current = undefined;

      onCompleteRef.current?.();
    },
    // Privy calls this when the attempt fails and when the viewer dismisses the modal. Leaving
    // the flag set would hand an abandoned press to whatever completion arrived next — a restore,
    // or a login started somewhere else on the page — which is the same unbidden replay the
    // arming exists to prevent, just later.
    onError: () => {
      requestedRef.current = false;
      requestedAnalyticsRef.current = undefined;
    },
  });

  return React.useCallback(() => {
    const search = searchParams?.toString();
    setPostOnboardingRedirect(optionsRef.current?.redirectTo ?? `${pathname}${search ? `?${search}` : ''}`);
    setName('');
    setTopicId('');
    setAvatar('');
    setSpaceId('');
    setStep('start');
    requestedRef.current = true;
    // Copied rather than referenced, so a caller rebuilding the object cannot rewrite an
    // attempt that is already in flight.
    requestedAnalyticsRef.current = optionsRef.current?.analytics ? { ...optionsRef.current.analytics } : undefined;
    login();
  }, [login, pathname, searchParams, setAvatar, setName, setPostOnboardingRedirect, setSpaceId, setStep, setTopicId]);
}
