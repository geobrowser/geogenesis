'use client';

import { useCallback, useRef } from 'react';

import { type ActionContext, withActionContext } from '~/core/action-context';
import { useActionContext, useActionScope } from '~/core/action-context-provider';
import { type AnalyticsProperties } from '~/core/analytics';
import { currentAuthAttempt, tagAuthAttempt } from '~/core/auth-attempt';
import { useGoogleSignInOptions } from '~/core/auth/google-sign-in';
import { openSignInBox } from '~/core/auth/sign-in-box/sign-in-box-store';
import { beginPrivyAuth, cancelPrivyAuth } from '~/core/privy-auth-events';
import { readStoredFeatureFlag } from '~/core/state/feature-flags';
import { useGeoLogin, usePrivy } from '~/core/wallet/auth-hooks';

type TrackedLoginParams = {
  /** The press's sign-in completed. */
  onComplete?: () => void;
  /** Privy reported a failure, or the sign-in was dismissed (`exited_auth_flow`). */
  onError?: (error: string) => void;
};

/** Per-press extras. */
export type TrackedLoginExtras = {
  /** Fills in the email field: a sign-in picked up again after the tab reloaded (GEO-3573). */
  prefillEmail?: string;
  /** The sign-in box's heading, for an entry with its own ask. */
  heading?: string;
  /** `privy` opens Privy's own dialog even with `ourSignInBox` on: the box's code step falls back to it. */
  surface?: 'privy';
};

/** Capture attribution at the press; the persistent observer owns completion tracking. */
export function useTrackedLogin(params: TrackedLoginParams) {
  const scope = useActionScope();
  const getContext = useActionContext(
    'sign_in_prompt',
    scope.target_type ?? 'application',
    scope.target_id ?? 'genesis'
  );
  const requested = useRef<ActionContext | null>(null);
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
  const complete = useCallback(() => {
    const context = requested.current;
    if (!context || currentAuthAttempt()?.id !== context.auth_attempt_id) return;
    requested.current = null;
    withActionContext(context, () => paramsRef.current?.onComplete?.());
  }, []);
  const fail = useCallback((error: string) => {
    if (!requested.current || currentAuthAttempt()?.id !== requested.current.auth_attempt_id) return;
    if (error === 'exited_auth_flow') requested.current = null;
    paramsRef.current?.onError?.(error);
  }, []);
  const { login } = useGeoLogin({
    onComplete: args => {
      if (!args.wasAlreadyAuthenticated) complete();
    },
    onError: error => fail(error),
  });
  const trackedLogin = useCallback(
    (properties?: AnalyticsProperties, options?: Parameters<typeof beginPrivyAuth>[1], extras?: TrackedLoginExtras) => {
      if (authenticatedRef.current) return undefined;
      const context = getContext(
        properties?.target_id && properties?.target_type
          ? { target_id: String(properties.target_id), target_type: String(properties.target_type) }
          : undefined
      );
      // A caller supplies the fallback component; inherited/clicked surfaces must
      // agree with the component on the signed-in action (for example an Explore card).
      const component =
        context.component === 'sign_in_prompt' ? (properties?.component ?? context.component) : context.component;
      const attempt = beginPrivyAuth({ ...context, auth_trigger: 'control', ...properties, component }, options);
      requested.current = { ...context, auth_attempt_id: attempt?.id };
      const prefillEmail = extras?.prefillEmail;
      if (attempt && extras?.surface !== 'privy' && readStoredFeatureFlag('ourSignInBox')) {
        tagAuthAttempt(attempt.id, { signInSurface: 'box' });
        openSignInBox({
          attemptId: attempt.id,
          attribution: { ...attempt.properties, component: String(attempt.properties.component) },
          heading: extras?.heading,
          prefillEmail,
          onComplete: complete,
          onDismiss: () => {
            fail('exited_auth_flow');
            cancelPrivyAuth();
          },
        });
        return attempt;
      }
      tagAuthAttempt(attempt?.id, { signInSurface: 'privy_modal' });
      const prefill = prefillEmail ? { prefill: { type: 'email' as const, value: prefillEmail } } : undefined;
      // No argument with neither, so Privy's modal keeps the config's methods.
      if (googleSignInOptions || prefill) login({ ...googleSignInOptions, ...prefill });
      else login();
      return attempt;
    },
    [login, getContext, googleSignInOptions, complete, fail]
  );
  return { login: trackedLogin };
}
