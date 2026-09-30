'use client';

import { type AnalyticsProperties, restorePrivySession, trackPrivyAuth } from './analytics';
import { beginSignupVisitor, clearSignupVisitor, signupVisitorProperties } from './auth/signup-visitor';

type Completion = Parameters<typeof trackPrivyAuth>[0];

// App-owned state outlives login buttons, feed rows, and the email capture card.
let attribution: AnalyticsProperties = {};
let completedUserId: string | null = null;
const signedUpUserIds = new Set<string>();

export function beginPrivyAuth(properties: AnalyticsProperties = {}, resume = false) {
  attribution = { ...properties };
  beginSignupVisitor(resume);
}

export function cancelPrivyAuth() {
  attribution = {};
  clearSignupVisitor();
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
    const visitor = signupVisitorProperties(params.user.createdAt ?? null);
    if (visitor.signup_context_source) {
      restorePrivySession(params.user, visitor);
      cancelPrivyAuth();
    } else {
      restorePrivySession(params.user);
    }
    return;
  }
  const attemptProperties = properties ?? attribution;
  const visitor = params.isNewUser ? signupVisitorProperties() : {};
  cancelPrivyAuth();

  if (params.isNewUser) {
    if (signedUpUserIds.has(params.user.id)) return;
    signedUpUserIds.add(params.user.id);
  }
  trackPrivyAuth(params, { ...attemptProperties, ...visitor, auth_flow: 'manual_login' });
}
