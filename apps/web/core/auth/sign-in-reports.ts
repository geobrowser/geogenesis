'use client';

import { type AuthAttempt, currentAuthAttempt, readAuthAttempt, subscribeAuthAttempts } from '~/core/auth-attempt';
import { reportEvent } from '~/core/telemetry/logger';
import { READY_TIMEOUT_MS, getState, realPrivyReady } from '~/core/wallet/auth-store';

/**
 * Sentry reports for a sign-in a visitor asked for and did not get. At most once per attempt, and
 * only while one is open: Privy loading in the background for nobody is not a broken sign-in.
 */

/** No box or dialog on screen this long after an attempt began. */
export const PROMPT_TIMEOUT_MS = 8_000;
/**
 * Privy not started this long after an attempt began. A call made later still waits its own
 * `READY_TIMEOUT_MS`, so this can fire for a load that is slow but works.
 */
export const PRIVY_READY_TIMEOUT_MS = READY_TIMEOUT_MS;
/** A code send that has neither resolved nor rejected. */
export const CODE_SEND_TIMEOUT_MS = 30_000;
/** Only an attempt begun this recently is watched: an older one was restored from storage. */
const FRESH_ATTEMPT_MS = 1_000;

export type SignInLoadFailure = 'chunk_load' | 'never_ready' | 'call_timeout';
type ReportName =
  'sign_in_load_failed' | 'sign_in_privy_not_ready' | 'sign_in_prompt_timeout' | 'sign_in_code_send_timeout';

const reported = new Map<string, Set<ReportName>>();

function openAttempt(id?: string): AuthAttempt | undefined {
  const attempt = id ? readAuthAttempt(id) : currentAuthAttempt();
  if (!attempt || attempt.endedAt || currentAuthAttempt()?.id !== attempt.id) return undefined;
  return attempt;
}

function stringProperty(attempt: AuthAttempt, key: string) {
  const value = attempt.properties[key];
  return typeof value === 'string' && value ? value : 'unknown';
}

/** Last time this page was hidden; -Infinity if never. Kept up by `onVisibilityChange`. */
let lastHiddenAt = Number.NEGATIVE_INFINITY;

/**
 * The page was hidden at some point since `attempt` began. A background tab throttles timers and
 * loading, so a timeout there says nothing about sign-in.
 */
function hiddenDuring(attempt: AuthAttempt) {
  return document.visibilityState === 'hidden' || lastHiddenAt >= attempt.startedAt;
}

function send(
  name: ReportName,
  attempt: AuthAttempt,
  level: 'warning' | 'error',
  extra: Record<string, unknown>,
  { reason, hiddenNowOnly = false }: { reason?: SignInLoadFailure; hiddenNowOnly?: boolean } = {}
) {
  if (hiddenNowOnly ? document.visibilityState === 'hidden' : hiddenDuring(attempt)) return;
  const sent = reported.get(attempt.id) ?? new Set<ReportName>();
  if (sent.has(name)) return;
  sent.add(name);
  reported.set(attempt.id, sent);
  const state = getState();
  reportEvent({
    name,
    level,
    tags: {
      sign_in_surface: attempt.signInSurface ?? 'unknown',
      component: stringProperty(attempt, 'component'),
      auth_trigger: stringProperty(attempt, 'auth_trigger'),
      link_source: stringProperty(attempt, 'link_source'),
      privy_loaded: realPrivyReady(),
      privy_requested: state.requested,
      privy_host_failed: state.hostFailed,
      ...(reason ? { reason } : {}),
    },
    extra: { auth_attempt_id: attempt.id, elapsed_ms: Date.now() - attempt.startedAt, ...extra },
  });
}

function errorSummary(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return { error_name: String((error as { name?: unknown }).name ?? 'Error'), error_message: String(error.message) };
  }
  return error === undefined ? {} : { error_message: String(error) };
}

/**
 * Privy could not be loaded or started for the open attempt. `never_ready` is its own Sentry issue
 * (`sign_in_privy_not_ready`): it can be a slow load that worked, so it alerts on a count.
 */
export function reportSignInLoadFailed(reason: SignInLoadFailure, details: { call?: string; error?: unknown } = {}) {
  const attempt = openAttempt();
  if (!attempt) return;
  const notReady = reason === 'never_ready';
  send(
    notReady ? 'sign_in_privy_not_ready' : 'sign_in_load_failed',
    attempt,
    notReady ? 'warning' : 'error',
    { reason, ...(details.call ? { call: details.call } : {}), ...errorSummary(details.error) },
    // A failed import counts from a background tab, but not from one being left: Safari aborts
    // loads on unload.
    { reason, hiddenNowOnly: reason === 'chunk_load' }
  );
}

/**
 * Reports a code send for `attemptId` still pending after `CODE_SEND_TIMEOUT_MS`. Returns the
 * cancel to call once the send settles.
 */
export function watchCodeSend(attemptId: string | undefined): () => void {
  if (typeof window === 'undefined' || !attemptId) return () => {};
  const timer = setTimeout(() => {
    const attempt = openAttempt(attemptId);
    if (attempt) send('sign_in_code_send_timeout', attempt, 'warning', { timeout_ms: CODE_SEND_TIMEOUT_MS });
  }, CODE_SEND_TIMEOUT_MS);
  return () => clearTimeout(timer);
}

const watched = new Map<string, ReturnType<typeof setTimeout>[]>();

function disarm(id: string) {
  watched.get(id)?.forEach(clearTimeout);
  watched.delete(id);
}

function arm(attempt: AuthAttempt) {
  const id = attempt.id;
  const prompt = setTimeout(() => {
    const open = openAttempt(id);
    if (open && open.openedAt === undefined) {
      send('sign_in_prompt_timeout', open, 'warning', { timeout_ms: PROMPT_TIMEOUT_MS });
    }
  }, PROMPT_TIMEOUT_MS);
  const ready = setTimeout(() => {
    disarm(id);
    if (!realPrivyReady()) reportSignInLoadFailed('never_ready');
  }, PRIVY_READY_TIMEOUT_MS);
  watched.set(id, [prompt, ready]);
}

function onAttemptsChanged() {
  for (const id of [...watched.keys()]) {
    const attempt = readAuthAttempt(id);
    if (!attempt || attempt.endedAt) disarm(id);
  }
  const attempt = currentAuthAttempt();
  if (!attempt || attempt.endedAt || watched.has(attempt.id) || reported.has(attempt.id)) return;
  if (Date.now() - attempt.startedAt > FRESH_ATTEMPT_MS) return;
  arm(attempt);
}

let pageHidden = false;

/** Records the moments the page was hidden: going hidden, and coming back from it. */
function onVisibilityChange() {
  const hidden = document.visibilityState === 'hidden';
  if (hidden || pageHidden) lastHiddenAt = Date.now();
  pageHidden = hidden;
}

let installed = false;

/** Starts watching attempts. Idempotent; client only. */
export function installSignInReports() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  pageHidden = document.visibilityState === 'hidden';
  subscribeAuthAttempts(onAttemptsChanged);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

/** Test seam. */
export function resetSignInReports() {
  for (const id of [...watched.keys()]) disarm(id);
  reported.clear();
  lastHiddenAt = Number.NEGATIVE_INFINITY;
  pageHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
}
