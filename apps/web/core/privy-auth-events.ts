'use client';

import { type AnalyticsProperties, trackPrivyAuth } from './analytics';

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
  // Restores are reported by AnalyticsUserIdentifier. They never consume an in-flight attempt.
  if (params.wasAlreadyAuthenticated || !params.user.id) return;
  if (completedUserId === params.user.id) return;
  completedUserId = params.user.id;
  const attemptProperties = properties ?? attribution;
  cancelPrivyAuth();

  if (params.isNewUser) {
    if (signedUpUserIds.has(params.user.id)) return;
    signedUpUserIds.add(params.user.id);
  }
  trackPrivyAuth(params, { ...attemptProperties, auth_flow: 'manual_login' });
}
