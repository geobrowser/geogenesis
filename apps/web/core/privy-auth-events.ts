'use client';

import { type AnalyticsProperties, restorePrivySession, trackPrivyAuth } from './analytics';

type Completion = Parameters<typeof trackPrivyAuth>[0];

// App-owned state outlives login buttons, feed rows, and the email capture card.
let attribution: AnalyticsProperties = {};
let completedUserId: string | null = null;
const signedUpUserIds = new Set<string>();

export function beginPrivyAuth(properties: AnalyticsProperties = {}) {
  attribution = { ...properties };
}

export function cancelPrivyAuth() {
  attribution = {};
}

export function resetPrivyAuthSession() {
  completedUserId = null;
  cancelPrivyAuth();
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
  const attemptProperties = properties ?? attribution;
  cancelPrivyAuth();

  if (params.isNewUser) {
    if (signedUpUserIds.has(params.user.id)) return;
    signedUpUserIds.add(params.user.id);
  }
  trackPrivyAuth(params, { ...attemptProperties, auth_flow: 'manual_login' });
}
