'use client';

import type { AnalyticsProperties } from '../analytics';
import { readAnalyticsContext } from '../analytics-context';

const storageKey = 'geo:signup-visitor:v1';
const maxAgeMs = 24 * 60 * 60 * 1000;
// Creation time is server-derived; attempt timestamps use the device clock. Keep
// tolerance narrow because a recently existing account can fall in this margin.
const clockSkewMs = 60_000;

type SignupVisitor = {
  startedAt: number;
  anonymousId: string;
  sessionId: string;
};

// Only used when browser storage is unavailable. Shared storage is authoritative across tabs.
let memory: SignupVisitor | null = null;
let memoryOnly = false;

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

export function beginSignupVisitor({ resume = false }: { resume?: boolean } = {}) {
  if (resume && pendingVisitor()) return;
  clearSignupVisitor();
  const current = readAnalyticsContext();
  if (current.user_id || !validId(current.anonymous_id) || !validId(current.session_id)) return;
  memory = { startedAt: Date.now(), anonymousId: current.anonymous_id, sessionId: current.session_id };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(memory));
  } catch {
    // Quota failures can block writes while reads still succeed with no saved value.
    memoryOnly = true;
  }
}

export function clearSignupVisitor() {
  memory = null;
  memoryOnly = false;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Private browsing may disallow storage.
  }
}

function pendingVisitor(now = Date.now()): SignupVisitor | null {
  let stored: string | null;
  try {
    stored = memoryOnly ? JSON.stringify(memory) : window.localStorage.getItem(storageKey);
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
    candidate.startedAt > now + clockSkewMs ||
    now - candidate.startedAt > maxAgeMs ||
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
  const now = Date.now();
  const visitor = pendingVisitor(now);
  if (!visitor) return {};
  if (createdAt !== undefined) {
    const created = createdAt ? new Date(createdAt).getTime() : NaN;
    // Account creation has second precision. Bound skew on both sides without
    // extending the attempt's expiry or admitting established accounts' restores.
    if (
      !Number.isFinite(created) ||
      created < Math.floor(visitor.startedAt / 1000) * 1000 - clockSkewMs ||
      created > now + clockSkewMs
    )
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
  const current = readAnalyticsContext();
  const available = validId(current.anonymous_id) && validId(current.session_id);
  return {
    ...properties,
    signup_anonymous_id: available ? current.anonymous_id : undefined,
    signup_session_id: available ? current.session_id : undefined,
    signup_context_source: available ? 'completion' : 'unavailable',
  };
}
