'use client';

import { useCallback, useRef } from 'react';

import { withActionContext } from '~/core/action-context';
import { useActionContext, useActionScope } from '~/core/action-context-provider';
import { type AnalyticsProperties } from '~/core/analytics';
import { continueAuthAttempt, currentAuthAttempt, tagAuthAttempt } from '~/core/auth-attempt';
import { useGoogleSignInOptions } from '~/core/auth/google-sign-in';
import { openSignInBox } from '~/core/auth/sign-in-box/sign-in-box-store';
import { beginPrivyAuth } from '~/core/privy-auth-events';
import { useGeoLogin, usePrivy } from '~/core/wallet/auth-hooks';

type TrackedLoginParams = {
  /** The press's attempt ended signed in. */
  onComplete?: () => void;
  /** The press's attempt was dismissed. */
  onAbandoned?: () => void;
};

/** Per-press extras. */
export type TrackedLoginExtras = {
  /** Fills in the email field: a sign-in picked up again after the tab reloaded (GEO-3573). */
  prefillEmail?: string;
  /** The sign-in box's heading, for an entry with its own ask. */
  heading?: string;
  /**
   * Opens Privy's own dialog on this open attempt instead of the box: the fallback for a box that
   * could not load or a code it could not send. Opens nothing once that attempt is not current.
   */
  fallbackFor?: string;
};

/** The attempt a fallback carries on: `fallbackFor`, while it is current and open. */
export function fallbackAttempt(fallbackFor: string | undefined) {
  if (fallbackFor === undefined) return undefined;
  const attempt = currentAuthAttempt();
  return attempt?.id === fallbackFor && !attempt.endedAt ? attempt : undefined;
}

/**
 * Starts a press's sign-in and registers its continuation on the attempt, which runs it once when
 * the attempt ends, whichever UI ended it and whether or not this control is still mounted.
 */
export function useTrackedLogin(params: TrackedLoginParams = {}) {
  const scope = useActionScope();
  const getContext = useActionContext(
    'sign_in_prompt',
    scope.target_type ?? 'application',
    scope.target_id ?? 'genesis'
  );
  // Privy's `login()` does nothing for someone already signed in, so an attempt opened then can only
  // ever be superseded by the next press (GEO-3245: 37 of them from one user stuck behind a Log in
  // button). Read through a ref so the returned callback keeps its identity.
  const { authenticated } = usePrivy();
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;
  // The only place Privy's login() is called, so the flag alone decides whether Google is offered.
  const googleSignInOptions = useGoogleSignInOptions();
  const paramsRef = useRef(params);
  paramsRef.current = params;
  // Privy's dialog reports to `PrivyAuthTracker`, which ends the attempt.
  const { login } = useGeoLogin({});

  const openPrivyDialog = useCallback(
    (attemptId: string, prefillEmail: string | undefined) => {
      tagAuthAttempt(attemptId, { signInSurface: 'privy_modal' });
      const prefill = prefillEmail ? { prefill: { type: 'email' as const, value: prefillEmail } } : undefined;
      // No argument with neither, so Privy's modal keeps the config's methods.
      if (googleSignInOptions || prefill) login({ ...googleSignInOptions, ...prefill });
      else login();
    },
    [login, googleSignInOptions]
  );

  const trackedLogin = useCallback(
    (properties?: AnalyticsProperties, options?: Parameters<typeof beginPrivyAuth>[1], extras?: TrackedLoginExtras) => {
      if (authenticatedRef.current) return undefined;
      const context = getContext(
        properties?.target_id && properties?.target_type
          ? { target_id: String(properties.target_id), target_type: String(properties.target_type) }
          : undefined
      );
      const continuation = {
        signedIn: () => withActionContext(context, () => paramsRef.current.onComplete?.()),
        abandoned: () => paramsRef.current.onAbandoned?.(),
      };

      if (extras?.fallbackFor !== undefined) {
        const resumed = fallbackAttempt(extras.fallbackFor);
        if (!resumed) return undefined;
        continueAuthAttempt(resumed.id, continuation);
        openPrivyDialog(resumed.id, extras.prefillEmail);
        return resumed;
      }

      // A caller supplies the fallback component; inherited/clicked surfaces must
      // agree with the component on the signed-in action (for example an Explore card).
      const component =
        context.component === 'sign_in_prompt' ? (properties?.component ?? context.component) : context.component;
      const attempt = beginPrivyAuth({ ...context, auth_trigger: 'control', ...properties, component }, options);
      continueAuthAttempt(attempt.id, continuation);
      tagAuthAttempt(attempt.id, { signInSurface: 'box' });
      openSignInBox({
        attemptId: attempt.id,
        attribution: { ...attempt.properties, component: String(attempt.properties.component) },
        heading: extras?.heading,
        prefillEmail: extras?.prefillEmail,
      });
      return attempt;
    },
    [getContext, openPrivyDialog]
  );
  return { login: trackedLogin };
}
