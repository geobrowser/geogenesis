'use client';

import { useGeoLogin } from '@geogenesis/auth';

import { useCallback, useRef } from 'react';

import { type ActionContext, withActionContext } from '~/core/action-context';
import { useActionContext, useActionScope } from '~/core/action-context-provider';
import { type AnalyticsProperties } from '~/core/analytics';
import { currentAuthAttempt } from '~/core/auth-attempt';
import { beginPrivyAuth } from '~/core/privy-auth-events';

/** Capture attribution at the press; the persistent observer owns completion tracking. */
export function useTrackedLogin(params: Parameters<typeof useGeoLogin>[0]) {
  const scope = useActionScope();
  const getContext = useActionContext(
    'sign_in_prompt',
    scope.target_type ?? 'application',
    scope.target_id ?? 'genesis'
  );
  const requested = useRef<ActionContext | null>(null);
  const { login } = useGeoLogin({
    ...params,
    onComplete: args => {
      const context = requested.current;
      if (!context || args.wasAlreadyAuthenticated || currentAuthAttempt()?.id !== context.auth_attempt_id) return;
      requested.current = null;
      return withActionContext(context, () => params?.onComplete?.(args));
    },
    onError: error => {
      if (!requested.current) return;
      if (error === 'exited_auth_flow') requested.current = null;
      params?.onError?.(error);
    },
  });
  const trackedLogin = useCallback(
    (properties?: AnalyticsProperties) => {
      const context = getContext(
        properties?.target_id && properties?.target_type
          ? { target_id: String(properties.target_id), target_type: String(properties.target_type) }
          : undefined
      );
      const attempt = beginPrivyAuth({ ...context, auth_trigger: 'control', ...properties });
      requested.current = { ...context, auth_attempt_id: attempt?.id };
      login();
      return attempt;
    },
    [login, getContext]
  );
  return { login: trackedLogin };
}
