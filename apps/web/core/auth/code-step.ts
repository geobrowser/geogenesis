'use client';

import { type AnalyticsProperties } from '~/core/analytics';
import { type AuthAttempt, attemptProperties, captureAuthEvent, currentAuthAttempt } from '~/core/auth-attempt';

/**
 * GEO-3573. The email code step, remembered across a reload of the tab.
 *
 * Phones often reload a backgrounded tab when the visitor comes back from their mail app, which
 * throws away Privy's dialog and the in-memory flow its code belongs to. Privy cannot resume that
 * flow (`loginWithCode` needs the `sendCode` that preceded it in the same document), so what this
 * keeps is enough to offer the sign-in again with the address filled in.
 *
 * Kept in sessionStorage: it belongs to the tab that asked for the code, survives that tab's reload,
 * and goes when the tab does. The address never leaves the device; events carry only the step.
 *
 * The step events are `experimental.auth_step`, one event with an `auth_step` property, so the
 * GEO-3550 funnel (email entered, code rejected or expired) adds values rather than event names.
 */

const KEY = 'geo:auth-code-step:v1';

/** How long after the code was sent a reloaded tab still offers to pick up where it left off. */
export const CODE_RECOVERY_WINDOW_MS = 10 * 60 * 1000;

export const AUTH_STEP_EVENT = 'experimental.auth_step';

export type AuthStep =
  'code_screen_shown' | 'left_code_screen' | 'returned_to_code_screen' | 'recovery_offered' | 'finished';

export type PendingCode = {
  /** The attempt the code was sent for. */
  attemptId?: string;
  /** Lowercased and trimmed, or null when the step could not see it. */
  email: string | null;
  sentAt: number;
  /** The document that sent it, to tell a reload from the same page coming back into view. */
  documentId: string;
  leftAt?: number;
  /** The attempt's attribution, so a recovered sign-in reports under the entry that started it. */
  properties: AnalyticsProperties;
  /** The attempt a reloaded tab opened to pick this up, if it has. */
  recoveryAttemptId?: string;
};

const DOCUMENT_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

/** The address the headless step is about to send to; Privy's own dialog is read from its field. */
let announcedEmail: string | null = null;

export function announceCodeEmail(email: string) {
  announcedEmail = normalize(email);
}

function normalize(value: unknown) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.includes('@') ? email : null;
}

export function readPendingCode(now = Date.now()): PendingCode | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as PendingCode | null;
    if (!value || typeof value.sentAt !== 'number' || typeof value.documentId !== 'string') return null;
    if (now - value.sentAt >= CODE_RECOVERY_WINDOW_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function write(value: PendingCode | null) {
  try {
    if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* Storage is optional; without it there is nothing to recover. */
  }
}

function capture(step: AuthStep, pending: PendingCode, extra: AnalyticsProperties = {}) {
  const attempt = currentAuthAttempt();
  captureAuthEvent(AUTH_STEP_EVENT, {
    ...pending.properties,
    ...(attempt ? attemptProperties(attempt) : {}),
    auth_step: step,
    code_attempt_id: pending.attemptId ?? null,
    code_age_ms: Date.now() - pending.sentAt,
    ...extra,
  });
}

/** Privy reports the code sent. `fieldEmail` is what its dialog's address field held, if any. */
export function codeScreenShown(fieldEmail?: string | null) {
  const attempt = currentAuthAttempt();
  const previous = readPendingCode();
  const pending: PendingCode = {
    attemptId: attempt?.id,
    email: announcedEmail ?? normalize(fieldEmail),
    sentAt: Date.now(),
    documentId: DOCUMENT_ID,
    properties: attempt ? entryAttribution(attempt.properties) : {},
    // A code sent from a recovered dialog is still that recovery.
    recoveryAttemptId: previous?.recoveryAttemptId,
  };
  announcedEmail = null;
  write(pending);
  capture('code_screen_shown', pending, { recovered: Boolean(pending.recoveryAttemptId) });
}

/** What the entry said about itself; the page it was on is a page the reloaded tab no longer has. */
function entryAttribution(properties: AnalyticsProperties): AnalyticsProperties {
  return Object.fromEntries(Object.entries(properties).filter(([key]) => !key.startsWith('page_')));
}

/** The tab went to the background with a code outstanding: the visitor is probably fetching it. */
export function codeStepHidden() {
  const pending = readPendingCode();
  if (!pending || pending.documentId !== DOCUMENT_ID || pending.leftAt !== undefined) return;
  const left = { ...pending, leftAt: Date.now() };
  write(left);
  capture('left_code_screen', left);
}

/** Back in view without a reload. */
export function codeStepVisible() {
  const pending = readPendingCode();
  if (!pending || pending.documentId !== DOCUMENT_ID || pending.leftAt === undefined) return;
  write({ ...pending, leftAt: undefined });
  capture('returned_to_code_screen', pending, { returned_to: 'same_page', away_ms: Date.now() - pending.leftAt });
}

/**
 * A code this tab asked for in an earlier document, still inside the window: the tab was reloaded
 * at the code step. Read-only, so the deep link and the recovery agree on the answer.
 */
export function reloadedCodeStep(now = Date.now()): PendingCode | null {
  const pending = readPendingCode(now);
  return pending && pending.documentId !== DOCUMENT_ID ? pending : null;
}

let claimedHere = false;

/** True when this document is picking up a reloaded code step, so nothing else opens sign-in. */
export function recoveringCodeStep(): boolean {
  return claimedHere || reloadedCodeStep() !== null;
}

/** Claims a reloaded code step for this document and reports the return. */
export function claimReloadedCodeStep(): PendingCode | null {
  const pending = reloadedCodeStep();
  if (!pending) return null;
  claimedHere = true;
  const claimed = { ...pending, documentId: DOCUMENT_ID, leftAt: undefined };
  write(claimed);
  capture('returned_to_code_screen', pending, {
    returned_to: 'reloaded_page',
    away_ms: Date.now() - (pending.leftAt ?? pending.sentAt),
  });
  return claimed;
}

/** The reloaded tab has reopened sign-in for `pending`, as attempt `attemptId`. */
export function codeRecoveryOffered(pending: PendingCode, attemptId: string | undefined) {
  const offered = { ...pending, recoveryAttemptId: attemptId };
  write(offered);
  capture('recovery_offered', offered, { prefilled: Boolean(pending.email) });
}

/** An attempt ended. Ends the code step if it was the one the code, or its recovery, belonged to. */
export function codeStepAttemptEnded(attempt: AuthAttempt) {
  const pending = readPendingCode();
  if (!pending || !attempt.outcome) return;
  if (attempt.id !== pending.attemptId && attempt.id !== pending.recoveryAttemptId) return;
  write(null);
  capture('finished', pending, { outcome: attempt.outcome, recovered: Boolean(pending.recoveryAttemptId) });
}

/** Signed out, or the step otherwise no longer applies. */
export function clearCodeStep() {
  announcedEmail = null;
  write(null);
}
