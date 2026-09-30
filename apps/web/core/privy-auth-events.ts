'use client';

import { type AnalyticsProperties, restorePrivySession, trackPrivyAuth } from './analytics';
import {
  attemptProperties,
  beginAuthAttempt,
  captureAuthEvent,
  currentAuthAttempt,
  finishAuthAttempt,
  recoverAuthAttempt,
  resetAuthAttempt,
} from './auth-attempt';
import { beginSignupVisitor, clearSignupVisitor, signupVisitorProperties } from './auth/signup-visitor';

type Completion = Parameters<typeof trackPrivyAuth>[0];

// App-owned state outlives login buttons, feed rows, and the email capture card.
let completedUserId: string | null = null;
const signedUpUserIds = new Set<string>();

export function beginPrivyAuth(
  properties: AnalyticsProperties = {},
  options: Parameters<typeof beginSignupVisitor>[0] = {}
) {
  beginSignupVisitor(options);
  return beginAuthAttempt(properties);
}

export function cancelPrivyAuth() {
  finishAuthAttempt('closed');
  clearSignupVisitor();
}

export function resetPrivyAuthSession() {
  completedUserId = null;
  cancelPrivyAuth();
  resetAuthAttempt();
}

export function completePrivyAuth(params: Completion, properties?: AnalyticsProperties) {
  if (!params.user.id) return;
  const completedThisSession = completedUserId === params.user.id;
  completedUserId = params.user.id;
  // Restores are not successful control-initiated attempts, even with a pending press.
  if (params.wasAlreadyAuthenticated) {
    if (!completedThisSession) {
      const visitor = signupVisitorProperties(params.user.createdAt ?? null);
      if (visitor.signup_context_source) {
        restorePrivySession(params.user, visitor);
        clearSignupVisitor();
      } else restorePrivySession(params.user);
    }
    return;
  }

  const duplicateLifecycle = completedThisSession || (params.isNewUser && signedUpUserIds.has(params.user.id));
  const attempt = currentAuthAttempt(true);
  // Suppress repeated account events without leaving a newly initiated attempt pending.
  // A duplicate callback with no active attempt must not invent another attempt either.
  if (duplicateLifecycle && (!attempt || attempt.endedAt)) {
    clearSignupVisitor();
    return;
  }
  if (params.isNewUser) signedUpUserIds.add(params.user.id);
  const active = attempt && !attempt.endedAt ? attempt : recoverAuthAttempt(properties);
  const attribution = attemptProperties(active);
  const visitor = params.isNewUser ? signupVisitorProperties() : {};
  clearSignupVisitor();

  if (!duplicateLifecycle) {
    trackPrivyAuth(params, {
      ...attribution,
      ...visitor,
      operation_id: params.isNewUser ? `signup:${params.user.id}` : active.id,
      auth_flow: 'manual_login',
    });
  }
  // An account already observed here is an existing account for this later attempt.
  finishAuthAttempt(params.isNewUser && !duplicateLifecycle ? 'signed_up' : 'signed_in', active);
  captureAuthEvent('auth_identity_linked', { ...attribution, user_id: params.user.id });
}
