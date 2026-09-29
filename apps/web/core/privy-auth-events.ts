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
  if (completedUserId === params.user.id) return;
  completedUserId = params.user.id;
  // Privy reports boot restores explicitly. A first ready+authenticated render can also be a
  // fresh login, so identity observers must not infer a second auth event from that state.
  if (params.wasAlreadyAuthenticated) {
    restorePrivySession(params.user);
    return;
  }

  if (params.isNewUser) {
    if (signedUpUserIds.has(params.user.id)) return;
    // The runtime owns durable delivery and lifecycle deduplication. Do not mark a signup
    // delivered in separate storage before it has reached that queue.
    signedUpUserIds.add(params.user.id);
  }
  const attempt = currentAuthAttempt(true);
  const active = attempt && !attempt.endedAt ? attempt : recoverAuthAttempt(properties);
  const attribution = attemptProperties(active);

  trackPrivyAuth(params, {
    ...attribution,
    operation_id: params.isNewUser ? `signup:${params.user.id}` : active.id,
    auth_flow: 'manual_login',
  });
  finishAuthAttempt(params.isNewUser ? 'signed_up' : 'signed_in', active);
  captureAuthEvent('auth_identity_linked', { ...attribution, user_id: params.user.id });
}
