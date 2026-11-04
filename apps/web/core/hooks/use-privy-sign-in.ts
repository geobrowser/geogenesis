'use client';

import * as React from 'react';

import { type AnalyticsProperties } from '~/core/analytics';
import { continueAuthAttempt } from '~/core/auth-attempt';
import { codeRecoveryOffered, codeRecoveryProperties, takeCodeRecovery } from '~/core/auth/code-step';
import { fallbackAttempt, useTrackedLogin } from '~/core/hooks/use-tracked-login';
import { usePrivy } from '~/core/wallet/auth-hooks';

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
  /** Keep the initiating signup visitor/session when email verification falls back to the modal. */
  resumeAuthAttempt?: boolean;
  /** The press's attempt was dismissed. */
  onError?: () => void;
  /** The sign-in box's heading, for an entry with its own ask. */
  heading?: string;
};

/** Per-press options, for a caller whose continuation depends on what was pressed. */
export type PrivySignInCallOptions = {
  /**
   * Runs if this press's sign-in is abandoned (the modal dismissed), alongside the hook-level
   * `onError`. A control that queued the viewer's action at the press — which side of a claim they
   * picked, say — withdraws it here, so a sign-in they walked away from does not publish it later.
   */
  onCancel?: () => void;
  /** Where this press returns to, for a caller whose destination depends on what was pressed. */
  redirectTo?: string;
  /** A new account is asked only for a name in onboarding (GEO-3517); see `usePrepareOnboarding`. */
  nameOnlyOnboarding?: boolean;
  /** Fills in the email field: a sign-in picked up again after the tab reloaded (GEO-3573). */
  prefillEmail?: string;
  /**
   * Opens Privy's own dialog on this open attempt: the code step's fallback. Its press keeps its
   * onboarding and return address; once the attempt is not current it opens nothing.
   */
  fallbackFor?: string;
};

type PrivySignIn = (
  properties?: AnalyticsProperties | React.SyntheticEvent,
  callOptions?: PrivySignInCallOptions
) => ReturnType<ReturnType<typeof useTrackedLogin>['login']>;

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

  // Signed in already: nothing to open, and no onboarding to clear (GEO-3245). `useTrackedLogin`
  // refuses too; checked here as well so the onboarding state is left alone.
  const { authenticated } = usePrivy();
  const authenticatedRef = React.useRef(authenticated);
  authenticatedRef.current = authenticated;

  const { login } = useTrackedLogin({
    onComplete: () => onCompleteRef.current?.(),
    onAbandoned: () => optionsRef.current?.onError?.(),
  });

  return React.useCallback<PrivySignIn>(
    (properties, callOptions) => {
      if (authenticatedRef.current) return undefined;
      const fallbackFor = callOptions?.fallbackFor;
      const resuming = fallbackFor !== undefined;
      if (resuming && !fallbackAttempt(fallbackFor)) return undefined;
      if (!resuming)
        prepareOnboarding({
          returnTo: callOptions?.redirectTo ?? optionsRef.current?.redirectTo,
          nameOnly: callOptions?.nameOnlyOnboarding,
        });
      const configured = optionsRef.current?.analytics;
      const own = {
        ...(typeof configured === 'function' ? configured() : configured),
        ...(properties && !('nativeEvent' in properties) ? properties : {}),
      };
      // GEO-3573: a code asked for on an earlier page is picked up by the first sign-in this page opens,
      // with its address filled back in, when that page is the same tab or the sign-in came from a link.
      const recovery = callOptions?.prefillEmail || resuming ? null : takeCodeRecovery(own);
      const attempt = login(
        { ...(recovery?.properties ?? {}), ...own, ...(recovery ? codeRecoveryProperties(recovery) : {}) },
        { resume: optionsRef.current?.resumeAuthAttempt },
        {
          prefillEmail: callOptions?.prefillEmail ?? recovery?.email ?? undefined,
          heading: optionsRef.current?.heading,
          fallbackFor,
        }
      );
      if (recovery) codeRecoveryOffered(recovery, attempt?.id);
      // Held by the attempt, so it runs even after this control unmounts.
      if (attempt && callOptions?.onCancel) continueAuthAttempt(attempt.id, { abandoned: callOptions.onCancel });
      return attempt;
    },
    [login, prepareOnboarding]
  );
}
