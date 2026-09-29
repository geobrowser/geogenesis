'use client';

import * as React from 'react';

import { type AnalyticsProperties } from '~/core/analytics';
import { useTrackedLogin } from '~/core/hooks/use-tracked-login';

import { usePrepareOnboarding } from './use-prepare-onboarding';

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
  analytics?: AnalyticsProperties | (() => AnalyticsProperties);
  /** Called only for an attempt this hook started, after Privy reports a failure or dismissal. */
  onError?: () => void;
};

/**
 * Opens Privy's own "Log in or sign up" dialog straight away, the way the upvote control does.
 *
 * Signed-out gates use this rather than an interstitial "create your personal space" card, which
 * cost the viewer a second click and a tinted overlay on the way to this same dialog. For a control
 * whose only barrier is "you are signed out", going directly to the login is the shorter path.
 *
 * Clears any half-finished onboarding first, and records where to return to so the viewer lands
 * back on the page they left rather than being bounced to explore.
 */
export function usePrivySignIn(onComplete?: () => void, options?: UsePrivySignInOptions) {
  const prepareOnboarding = usePrepareOnboarding();

  // Held in a ref so callers can pass an inline closure without re-creating the returned callback
  // on every render — `castVote` and the feed's button handler both depend on its identity.
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Held for the same reason, so a caller can pass an inline object literal.
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  // useTrackedLogin owns attempt scoping for both completion and dismissal.
  const { login } = useTrackedLogin({
    onComplete: () => onCompleteRef.current?.(),
    onError: error => {
      // A rejected OTP can be retried in the same modal; only dismissal abandons the intent.
      if (error === 'exited_auth_flow') optionsRef.current?.onError?.();
    },
  });

  return React.useCallback(
    (properties?: AnalyticsProperties | React.SyntheticEvent) => {
      prepareOnboarding({ returnTo: optionsRef.current?.redirectTo });
      const configured = optionsRef.current?.analytics;
      return login({
        ...(typeof configured === 'function' ? configured() : configured),
        ...(properties && !('nativeEvent' in properties) ? properties : {}),
      });
    },
    [login, prepareOnboarding]
  );
}
