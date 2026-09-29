'use client';

import { ACTION_CONTEXT_FIELDS, pageContext } from './action-context';
import { type AnalyticsProperties, capture } from './analytics';

const PREFIX = 'geo:auth-attempt:v1:';
const POINTER = 'geo:auth-attempt:active';
const TTL = 24 * 60 * 60 * 1000;
export type AuthAttempt = {
  id: string;
  startedAt: number;
  openedAt?: number;
  endedAt?: number;
  outcome?: 'signed_up' | 'signed_in' | 'closed' | 'superseded';
  properties: AnalyticsProperties;
  actionSucceeded?: boolean;
};
let memory: AuthAttempt | undefined;
const fields = new Set<string>([
  ...ACTION_CONTEXT_FIELDS,
  'auth_control',
  'auth_trigger',
  'auth_intent',
  'auth_continuation',
  'link_source',
  'signup_surface',
  'form_type',
  'marketing_page',
  'marketing_cta',
  'marketing_handoff_id',
]);

export function authProperties(properties: AnalyticsProperties = {}): AnalyticsProperties {
  const clean = JSON.parse(
    JSON.stringify(Object.fromEntries(Object.entries(properties).filter(([key]) => fields.has(key))))
  );
  let identity: AnalyticsProperties = {};
  try {
    identity = (window.lytics ?? window.geoAnalytics)?.getContext?.() ?? {};
  } catch {
    /* Optional runtime. */
  }
  const page = pageContext();
  return {
    ...page,
    page_entity_id: page.page_entity_id ?? null,
    page_entity_type: page.page_entity_type ?? null,
    component: 'unknown',
    target_id: 'unknown',
    target_type: 'unknown',
    auth_control: 'unknown',
    auth_trigger: 'unknown',
    action_session_id: identity.session_id,
    action_anonymous_id: identity.anonymous_id,
    ...clean,
    action_context_version: 'v1',
    auth_attribution_version: 'v1',
    measurement_version: 'growth-v2',
  };
}
function read(id: string | null): AuthAttempt | undefined {
  if (!id) return;
  try {
    const value = JSON.parse(localStorage.getItem(PREFIX + id) ?? 'null');
    if (
      value?.id === id &&
      typeof value.startedAt === 'number' &&
      value.properties &&
      Date.now() - value.startedAt < TTL
    )
      return value;
  } catch {
    /* Storage can be unavailable. */
  }
  if (memory?.id === id && Date.now() - memory.startedAt < TTL) return memory;
}
export function readAuthAttempt(id: string) {
  return read(id);
}

function emit(event: string, properties: AnalyticsProperties) {
  try {
    capture(event, properties);
  } catch {
    /* Never block authentication or a queued action. */
  }
}

function save(attempt: AuthAttempt, activate = true) {
  if (activate || memory?.id === attempt.id) memory = attempt;
  try {
    localStorage.setItem(PREFIX + attempt.id, JSON.stringify(attempt));
    if (activate) sessionStorage.setItem(POINTER, attempt.id);
  } catch {
    /* Keep in-memory attribution when storage is blocked. */
  }
}
/** Prefer this tab's attempt. A new tab can inherit only an unambiguous active attempt. */
export function currentAuthAttempt(recoverFromOtherTab = false): AuthAttempt | undefined {
  try {
    const own = read(sessionStorage.getItem(POINTER));
    if (own) return own;
    if (memory && Date.now() - memory.startedAt < TTL) return memory;
    if (!recoverFromOtherTab) return;
    const active: AuthAttempt[] = [];
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PREFIX)) continue;
      const candidate = read(key.slice(PREFIX.length));
      if (!candidate) localStorage.removeItem(key);
      else if (!candidate.endedAt) active.push(candidate);
    }
    if (active.length === 1) {
      save(active[0]);
      return active[0];
    }
  } catch {
    return memory && Date.now() - memory.startedAt < TTL ? memory : undefined;
  }
}
export function attemptProperties(attempt: AuthAttempt): AnalyticsProperties {
  return { ...attempt.properties, auth_attempt_id: attempt.id };
}
export function beginAuthAttempt(properties: AnalyticsProperties = {}) {
  const previous = currentAuthAttempt();
  if (previous && !previous.endedAt) finishAuthAttempt('superseded', previous);
  const attempt: AuthAttempt = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    properties: authProperties(properties),
  };
  save(attempt);
  emit('auth_attempt_started', attemptProperties(attempt));
  return attempt;
}
export function openAuthAttempt() {
  const attempt = currentAuthAttempt();
  if (!attempt || attempt.endedAt || attempt.openedAt !== undefined) return;
  attempt.openedAt = Date.now();
  save(attempt);
  emit('auth_prompt_viewed', attemptProperties(attempt));
}
export function finishAuthAttempt(outcome: NonNullable<AuthAttempt['outcome']>, attempt = currentAuthAttempt()) {
  if (!attempt || attempt.endedAt) return;
  attempt.endedAt = Date.now();
  attempt.outcome = outcome;
  save(attempt);
  if ((outcome === 'closed' || outcome === 'superseded') && attempt.properties.auth_continuation === 'queued') {
    emit('auth_action_completed', {
      ...attemptProperties(attempt),
      outcome: 'cancelled',
      failure_code: outcome,
      operation_id: `cancel:${attempt.id}`,
    });
  }
  emit('auth_attempt_completed', {
    ...attemptProperties(attempt),
    outcome,
    auth_duration_ms: Math.max(0, attempt.endedAt - (attempt.openedAt ?? attempt.startedAt)),
    prompt_seen: attempt.openedAt !== undefined,
  });
}
export function recoverAuthAttempt(properties?: AnalyticsProperties) {
  const attempt: AuthAttempt = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    properties: authProperties(properties),
  };
  save(attempt);
  return attempt;
}

export function resetAuthAttempt() {
  memory = undefined;
  try {
    sessionStorage.removeItem(POINTER);
  } catch {
    /* Optional storage. */
  }
}

/** Stable, non-PII marketing identifiers; never collect an arbitrary URL or CTA text. */
export function marketingAuthProperties(search: string): AnalyticsProperties {
  const params = new URLSearchParams(search);
  return Object.fromEntries(
    ['marketing_page', 'marketing_cta', 'marketing_handoff_id'].flatMap(key => {
      const value = params.get(key);
      return value && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? [[key, value]] : [];
    })
  );
}

/** Progress is resumable; an explicit dismissal is separate from the last step seen. */
export function trackAuthOnboarding(step: string, outcome: 'viewed' | 'completed' | 'dismissed' | 'failed') {
  const attempt = currentAuthAttempt();
  if (!attempt || !['signed_up', 'signed_in'].includes(attempt.outcome ?? '')) return;
  emit('auth_onboarding_progress', { ...attemptProperties(attempt), onboarding_step: step, outcome });
}

/** Join only the intended action on the same target, never all later account activity. */
export function authAttemptForAction(action: string, targetId: string, attemptId?: string): AuthAttempt | undefined {
  const attempt = attemptId ? read(attemptId) : currentAuthAttempt();
  if (!attempt || !['signed_up', 'signed_in'].includes(attempt.outcome ?? '')) return;
  if (!attemptId && attempt.properties.auth_continuation !== 'resume') return;
  if (attempt.actionSucceeded || attempt.properties.auth_intent !== action) return;
  if (!attemptId && String(attempt.properties.target_id).replaceAll('-', '') !== targetId.replaceAll('-', '')) return;
  return attempt;
}

export function completeAuthAction(
  attempt: AuthAttempt,
  outcome: 'succeeded' | 'failed' | 'unknown',
  operationId: string
) {
  if (outcome === 'succeeded') {
    attempt.actionSucceeded = true;
    save(attempt, false);
  }
  emit('auth_action_completed', { ...attemptProperties(attempt), outcome, operation_id: operationId });
}
