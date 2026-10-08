'use client';

import { ACTION_CONTEXT_FIELDS, pageContext } from './action-context';
import { type AnalyticsEventName, type AnalyticsProperties, capture } from './analytics';
import { isAnalyticsEnabled, readAnalyticsContext } from './analytics-context';
import { equals } from './id/normalize';

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
// sessionStorage can be copied into another tab. Only this document's own presses
// can be closed/superseded here; persisted pointers are also used for OAuth recovery.
let ownedAttemptId: string | undefined;
const unpersisted = new Map<string, AuthAttempt>();
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
  // How many device votes a save sign-in was started for (GEO-3214).
  'local_vote_count',
]);

const sourceIdentifierFields = new Set(['link_source', 'marketing_page', 'marketing_cta', 'marketing_handoff_id']);

function isSourceIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

function sanitizeSourceIdentifiers(properties: AnalyticsProperties): AnalyticsProperties {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => !sourceIdentifierFields.has(key) || isSourceIdentifier(value))
  );
}

export function authProperties(properties: AnalyticsProperties = {}): AnalyticsProperties {
  const clean = JSON.parse(
    JSON.stringify(
      sanitizeSourceIdentifiers(Object.fromEntries(Object.entries(properties).filter(([key]) => fields.has(key))))
    )
  );
  const identity = readAnalyticsContext();
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
  };
}
function read(id: string | null): AuthAttempt | undefined {
  if (!id) return;
  const pending = unpersisted.get(id);
  if (pending && Date.now() - pending.startedAt < TTL) return pending;
  if (!isAnalyticsEnabled) return;
  try {
    const value = JSON.parse(localStorage.getItem(PREFIX + id) ?? 'null');
    if (
      value?.id === id &&
      typeof value.startedAt === 'number' &&
      value.properties &&
      Date.now() - value.startedAt < TTL
    )
      return { ...value, properties: sanitizeSourceIdentifiers(value.properties) };
  } catch {
    /* Storage can be unavailable. */
  }
  if (memory?.id === id && Date.now() - memory.startedAt < TTL) return memory;
}
export function readAuthAttempt(id: string) {
  return read(id);
}

export function captureAuthEvent(event: AnalyticsEventName, properties: AnalyticsProperties) {
  try {
    capture(event, { ...properties, measurement_version: 'growth-v2' });
  } catch {
    /* Never block authentication or a queued action. */
  }
}

function save(attempt: AuthAttempt, activate = true) {
  if (activate || memory?.id === attempt.id) memory = attempt;
  if (!isAnalyticsEnabled) {
    unpersisted.set(attempt.id, attempt);
    return;
  }
  try {
    localStorage.setItem(PREFIX + attempt.id, JSON.stringify(attempt));
    unpersisted.delete(attempt.id);
  } catch {
    unpersisted.set(attempt.id, attempt);
  }
  if (activate) {
    try {
      sessionStorage.setItem(POINTER, attempt.id);
    } catch {
      /* The in-memory pointer remains authoritative for this tab. */
    }
  }
}
/** Prefer this tab's attempt. A new tab can inherit only an unambiguous active attempt. */
export function currentAuthAttempt(recoverFromOtherTab = false): AuthAttempt | undefined {
  if (memory && Date.now() - memory.startedAt < TTL) return read(memory.id);
  try {
    const persisted = read(sessionStorage.getItem(POINTER));
    if (persisted) return persisted;
    if (!recoverFromOtherTab) return;
    const active: AuthAttempt[] = [];
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PREFIX)) continue;
      const candidate = read(key.slice(PREFIX.length));
      if (!candidate) localStorage.removeItem(key);
      else if (!candidate.endedAt) active.push(candidate);
    }
    if (active.length === 1) {
      // Reading a recovery candidate does not grant ownership or rewrite shared state.
      memory = active[0];
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
  for (const [id, attempt] of unpersisted) {
    if (Date.now() - attempt.startedAt >= TTL) unpersisted.delete(id);
  }
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX) && !read(key.slice(PREFIX.length))) localStorage.removeItem(key);
    }
  } catch {
    /* Storage is optional. */
  }
  const previous = currentAuthAttempt();
  if (previous && !previous.endedAt) finishAuthAttempt('superseded', previous);
  const attempt: AuthAttempt = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    properties: authProperties(properties),
  };
  ownedAttemptId = attempt.id;
  save(attempt);
  captureAuthEvent('auth_attempt_started', attemptProperties(attempt));
  return attempt;
}
export function openAuthAttempt(properties: AnalyticsProperties = { auth_trigger: 'redirect' }) {
  let attempt = currentAuthAttempt();
  if (!attempt || attempt.endedAt || attempt.id !== ownedAttemptId) attempt = beginAuthAttempt(properties);
  if (attempt.openedAt !== undefined) return;
  attempt.openedAt = Date.now();
  save(attempt);
  captureAuthEvent('auth_prompt_viewed', attemptProperties(attempt));
}
export function finishAuthAttempt(outcome: NonNullable<AuthAttempt['outcome']>, attempt = currentAuthAttempt()) {
  if (!attempt || attempt.endedAt) return;
  if ((outcome === 'closed' || outcome === 'superseded') && attempt.id !== ownedAttemptId) return;
  attempt.endedAt = Date.now();
  attempt.outcome = outcome;
  save(attempt);
  captureAuthEvent('auth_attempt_completed', {
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
  ownedAttemptId = undefined;
  unpersisted.clear();
  try {
    sessionStorage.removeItem(POINTER);
  } catch {
    /* Optional storage. */
  }
}

/** Stable, non-PII marketing identifiers; never collect an arbitrary URL or CTA text. */
export function marketingAuthProperties(search: string): AnalyticsProperties {
  const params = new URLSearchParams(search);
  if (params.get('via') !== 'marketing') return {};
  return Object.fromEntries(
    ['marketing_page', 'marketing_cta', 'marketing_handoff_id'].flatMap(key => {
      const value = params.get(key);
      return isSourceIdentifier(value) ? [[key, value]] : [];
    })
  );
}

/** Progress is resumable; an explicit dismissal is separate from the last step seen. */
export function trackAuthOnboarding(step: string, outcome: 'viewed' | 'completed' | 'dismissed' | 'failed') {
  const attempt = currentAuthAttempt();
  if (!attempt || !['signed_up', 'signed_in'].includes(attempt.outcome ?? '')) return;
  captureAuthEvent('auth_onboarding_progress', { ...attemptProperties(attempt), onboarding_step: step, outcome });
}

/** Join only the intended action on the same target, never all later account activity. */
export function authAttemptForAction(action: string, targetId: string, attemptId?: string): AuthAttempt | undefined {
  const attempt = attemptId ? read(attemptId) : currentAuthAttempt();
  if (!attempt || !['signed_up', 'signed_in'].includes(attempt.outcome ?? '')) return;
  if (!attemptId && attempt.properties.auth_continuation !== 'resume') return;
  if (attempt.actionSucceeded || attempt.properties.auth_intent !== action) return;
  if (!attemptId && !equals(String(attempt.properties.target_id), targetId)) return;
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
  captureAuthEvent('auth_action_completed', { ...attemptProperties(attempt), outcome, operation_id: operationId });
}
