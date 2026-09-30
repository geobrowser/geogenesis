'use client';

import type { AnalyticsProperties } from '../analytics';

const storageKey = 'geo:signup-visitor:v1';
const maxAgeMs = 24 * 60 * 60 * 1000;

type SignupVisitor = {
  startedAt: number;
  anonymousId: string;
  sessionId: string;
};

// Only used when browser storage is unavailable. Shared storage is authoritative across tabs.
let memory: SignupVisitor | null = null;

function context() {
  try {
    if (typeof window === 'undefined' || process.env.NEXT_PUBLIC_DISABLE_POSTHOG === '1') return {};
    return (window.lytics ?? window.geoAnalytics)?.getContext?.() ?? {};
  } catch {
    return {};
  }
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

export function beginSignupVisitor(resume = false) {
  if (resume && pendingVisitor()) return;
  clearSignupVisitor();
  const current = context();
  if (current.user_id || !validId(current.anonymous_id) || !validId(current.session_id)) return;
  memory = { startedAt: Date.now(), anonymousId: current.anonymous_id, sessionId: current.session_id };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(memory));
  } catch {
    // Storage restrictions must never prevent login.
  }
}

export function clearSignupVisitor() {
  memory = null;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Private browsing may disallow storage.
  }
}

function pendingVisitor(): SignupVisitor | null {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(storageKey);
  } catch {
    stored = JSON.stringify(memory);
  }
  let candidate: SignupVisitor | null;
  try {
    candidate = JSON.parse(stored ?? 'null');
  } catch {
    clearSignupVisitor();
    return null;
  }
  if (
    !candidate ||
    !Number.isFinite(candidate.startedAt) ||
    candidate.startedAt > Date.now() ||
    Date.now() - candidate.startedAt > maxAgeMs ||
    !validId(candidate.anonymousId) ||
    !validId(candidate.sessionId)
  ) {
    clearSignupVisitor();
    return null;
  }
  return candidate;
}

/** A restore can finish signup in another tab without Privy reporting a fresh login. */
export function signupVisitorProperties(createdAt?: Date | string | null): AnalyticsProperties {
  const visitor = pendingVisitor();
  if (!visitor) return {};
  if (createdAt !== undefined) {
    const created = createdAt ? new Date(createdAt).getTime() : NaN;
    // Do not attach an abandoned signup attempt to an existing account's boot restore.
    if (!Number.isFinite(created) || created < Math.floor(visitor.startedAt / 1000) * 1000 || created > Date.now())
      return {};
  }
  return {
    signup_anonymous_id: visitor.anonymousId,
    signup_session_id: visitor.sessionId,
    signup_started_at: new Date(visitor.startedAt).toISOString(),
    signup_context_source: 'auth_start',
  };
}

/** Called immediately before the runtime identifies the new account, including queued calls. */
export function withSignupVisitor(properties: AnalyticsProperties): AnalyticsProperties {
  if (properties.signup_context_source === 'auth_start') return properties;
  const current = context();
  const available = validId(current.anonymous_id) && validId(current.session_id);
  return {
    ...properties,
    signup_anonymous_id: available ? current.anonymous_id : undefined,
    signup_session_id: available ? current.session_id : undefined,
    signup_context_source: available ? 'completion' : 'unavailable',
  };
}
