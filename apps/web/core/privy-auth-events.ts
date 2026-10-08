'use client';

import { type AnalyticsProperties, restorePrivySession, trackPrivyAuth } from './analytics';
import {
  type AuthAttemptOutcome,
  attemptProperties,
  beginAuthAttempt,
  captureAuthEvent,
  currentAuthAttempt,
  finishAuthAttempt,
  recoverAuthAttempt,
  resetAuthAttempt,
} from './auth-attempt';
import { clearSignInAbandoned, runSignInAbandoned } from './auth/sign-in-abandoned';
import { beginSignupVisitor, clearSignupVisitor, createdSince, signupVisitorProperties } from './auth/signup-visitor';

type Completion = Parameters<typeof trackPrivyAuth>[0];

// App-owned state outlives login buttons, feed rows, and the email capture card.
let completedUserId: string | null = null;
const signedUpUserIds = new Set<string>();

export function beginPrivyAuth(
  properties: AnalyticsProperties = {},
  options: Parameters<typeof beginSignupVisitor>[0] = {}
) {
  beginSignupVisitor(options);
  // A new attempt replaces the last; whatever it would have withdrawn belongs to that one.
  clearSignInAbandoned();
  return beginAuthAttempt(properties);
}

/** Privy's account when its flow was exited: the signed-in user, or null if nobody had signed in. */
export type ExitedFlowAccount = { createdAt?: Date | string | null } | null;

/**
 * How an exited sign-in ended (GEO-3243). Exiting Privy's flow after the email code has been accepted
 * still leaves an account behind — a new one, if this attempt created it — so it is not a sign-in the
 * visitor gave up on, and recording it as `closed` hid every such account from the funnel.
 */
function exitOutcome(account: ExitedFlowAccount): AuthAttemptOutcome {
  if (!account) return 'closed';
  const attempt = currentAuthAttempt();
  return attempt && createdSince(account.createdAt, attempt.startedAt) ? 'left_after_sign_up' : 'left_after_sign_in';
}

export function cancelPrivyAuth(account: ExitedFlowAccount = null) {
  finishAuthAttempt(exitOutcome(account));
  clearSignupVisitor();
  runSignInAbandoned();
}

/**
 * Signed out. `account` is whoever the open attempt had signed in, if anyone: Privy signs an exited
 * flow's account out, and that sign-out can be seen before the exit itself, so it classifies the
 * attempt the same way the exit would have.
 */
export function resetPrivyAuthSession(account: ExitedFlowAccount = null) {
  completedUserId = null;
  cancelPrivyAuth(account);
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

  // Signed in: nothing queued for this attempt is to be withdrawn any more.
  clearSignInAbandoned();
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
