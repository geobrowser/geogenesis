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

type Completion = Parameters<typeof trackPrivyAuth>[0];

// App-owned state outlives login buttons, feed rows, and the email capture card.
let completedUserId: string | null = null;
const signedUpUserIds = new Set<string>();

export function beginPrivyAuth(properties: AnalyticsProperties = {}) {
  return beginAuthAttempt(properties);
}

export function cancelPrivyAuth() {
  finishAuthAttempt('closed');
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
    if (!completedThisSession) restorePrivySession(params.user);
    return;
  }

  const duplicateLifecycle = completedThisSession || (params.isNewUser && signedUpUserIds.has(params.user.id));
  const attempt = currentAuthAttempt(true);
  // Suppress repeated account events without leaving a newly initiated attempt pending.
  // A duplicate callback with no active attempt must not invent another attempt either.
  if (duplicateLifecycle && (!attempt || attempt.endedAt)) return;
  if (params.isNewUser) signedUpUserIds.add(params.user.id);
  const active = attempt && !attempt.endedAt ? attempt : recoverAuthAttempt(properties);
  const attribution = attemptProperties(active);

  if (!duplicateLifecycle) {
    trackPrivyAuth(params, {
      ...attribution,
      operation_id: params.isNewUser ? `signup:${params.user.id}` : active.id,
      auth_flow: 'manual_login',
    });
  }
  // An account already observed here is an existing account for this later attempt.
  finishAuthAttempt(params.isNewUser && !duplicateLifecycle ? 'signed_up' : 'signed_in', active);
  captureAuthEvent('auth_identity_linked', { ...attribution, user_id: params.user.id });
}
