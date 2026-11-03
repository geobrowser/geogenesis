'use client';

import { type AnalyticsProperties } from '~/core/analytics';
import { type AuthAttempt, attemptProperties, captureAuthEvent, currentAuthAttempt } from '~/core/auth-attempt';

/**
 * GEO-3573. The email code step, kept for ten minutes in localStorage so a reloaded or new tab can
 * reopen sign-in prefilled: Privy's `loginWithCode` only works in the document that sent the code.
 * The address stays on the device; events carry only the step.
 */

const KEY = 'geo:auth-code-step:v1';

/** How long after the code was sent a new page still offers to pick up where it left off. */
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
  /** The entry that started it (`ATTRIBUTION_KEYS`), so a recovered sign-in reports under it. */
  properties: AnalyticsProperties;
  /** The document picking this up. The first to claim it wins; any other tab behaves normally. */
  claimedBy?: string;
  /** The attempt that document opened to pick it up. */
  recoveryAttemptId?: string;
};

/** What a recovered sign-in needs to report under the entry that started it, and nothing else. */
const ATTRIBUTION_KEYS = [
  'component',
  'auth_trigger',
  'auth_control',
  'auth_intent',
  'link_source',
  'target_type',
  'target_id',
  'prompt_reason',
  'local_vote_count',
] as const;

const DOCUMENT_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

/** The query this document loaded with, before any deep link cleared its trigger. */
const LANDING_SEARCH = typeof window === 'undefined' ? '' : window.location.search;

/** This page arrived on a `?modal=` link, whose handler may open sign-in itself. */
export function landedOnModalLink() {
  return new URLSearchParams(LANDING_SEARCH).has('modal');
}

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
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PendingCode | null;
    if (!value || typeof value.sentAt !== 'number' || typeof value.documentId !== 'string') return null;
    if (now - value.sentAt >= CODE_RECOVERY_WINDOW_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function write(value: PendingCode | null) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
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
  const recovering = previous?.claimedBy === DOCUMENT_ID;
  const pending: PendingCode = {
    attemptId: attempt?.id,
    email: announcedEmail ?? normalize(fieldEmail),
    sentAt: Date.now(),
    documentId: DOCUMENT_ID,
    properties: attempt ? entryAttribution(attempt.properties) : {},
    // A code sent from a recovered dialog is still that recovery.
    ...(recovering ? { claimedBy: DOCUMENT_ID, recoveryAttemptId: previous.recoveryAttemptId } : {}),
  };
  announcedEmail = null;
  write(pending);
  setNotice(null);
  capture('code_screen_shown', pending, { recovered: recovering });
}

function entryAttribution(properties: AnalyticsProperties): AnalyticsProperties {
  return Object.fromEntries(ATTRIBUTION_KEYS.filter(key => key in properties).map(key => [key, properties[key]]));
}

/** The code is this document's own, and no other document has taken it over. */
function ownCode(pending: PendingCode | null): pending is PendingCode {
  return (
    pending !== null && pending.documentId === DOCUMENT_ID && (!pending.claimedBy || pending.claimedBy === DOCUMENT_ID)
  );
}

/** The tab went to the background with a code outstanding: the visitor is probably fetching it. */
export function codeStepHidden() {
  const pending = readPendingCode();
  if (!ownCode(pending) || pending.leftAt !== undefined) return;
  const left = { ...pending, leftAt: Date.now() };
  write(left);
  capture('left_code_screen', left);
}

/** Back in view without a new page. */
export function codeStepVisible() {
  const pending = readPendingCode();
  if (!ownCode(pending) || pending.leftAt === undefined) return;
  write({ ...pending, leftAt: undefined });
  capture('returned_to_code_screen', pending, { returned_to: 'same_page', away_ms: Date.now() - pending.leftAt });
}

/**
 * A code asked for by an earlier document (this tab reloaded, or a new tab from the mail link),
 * still inside the window and not yet taken over by another document. Read-only.
 */
export function reloadedCodeStep(now = Date.now()): PendingCode | null {
  const pending = readPendingCode(now);
  return pending && pending.documentId !== DOCUMENT_ID && !pending.claimedBy ? pending : null;
}

/**
 * For a sign-in being opened: the code step this document picks up, claiming it on first use and
 * reporting the return. Null when there is none, or another tab claimed it first.
 */
export function takeCodeRecovery(): PendingCode | null {
  const current = readPendingCode();
  if (current?.claimedBy === DOCUMENT_ID && current.documentId !== DOCUMENT_ID) return current;
  const pending = reloadedCodeStep();
  if (!pending) return null;
  write({ ...pending, claimedBy: DOCUMENT_ID, leftAt: undefined });
  // localStorage has no compare-and-set; a tab that lost the race reads the winner's claim here.
  const claimed = readPendingCode();
  if (claimed?.claimedBy !== DOCUMENT_ID) return null;
  capture('returned_to_code_screen', pending, {
    returned_to: 'new_page',
    away_ms: Date.now() - (pending.leftAt ?? pending.sentAt),
  });
  return claimed;
}

/** Marks the sign-in that picks `pending` up; its entry's own attribution is `pending.properties`. */
export function codeRecoveryProperties(pending: PendingCode): AnalyticsProperties {
  return { auth_recovery: 'reloaded_code_step', recovered_attempt_id: pending.attemptId ?? null };
}

/** Sign-in has been reopened for `pending`, as attempt `attemptId`. */
export function codeRecoveryOffered(pending: PendingCode, attemptId: string | undefined) {
  const offered = { ...pending, recoveryAttemptId: attemptId };
  write(offered);
  setNotice({ email: pending.email });
  capture('recovery_offered', offered, { prefilled: Boolean(pending.email) });
}

/**
 * An attempt in this document ended. Any sign-in, or the visitor closing sign-in, ends the code step;
 * it is reported as finished when the attempt was the code's own or its recovery's.
 */
export function codeStepAttemptEnded(attempt: AuthAttempt) {
  const pending = readPendingCode();
  if (!pending || !attempt.outcome || attempt.outcome === 'superseded') return;
  const own = attempt.id === pending.attemptId || attempt.id === pending.recoveryAttemptId;
  write(null);
  setNotice(null);
  if (own) capture('finished', pending, { outcome: attempt.outcome, recovered: Boolean(pending.recoveryAttemptId) });
}

/** Cleared on sign-out too, so a shared device never prefills the previous person's address. */
export function clearCodeStep() {
  announcedEmail = null;
  write(null);
  setNotice(null);
}

// The notice over Privy's dialog, while a recovered sign-in is waiting for its new code.
export type RecoveryNotice = { email: string | null } | null;
let notice: RecoveryNotice = null;
const noticeListeners = new Set<() => void>();

function setNotice(next: RecoveryNotice) {
  if (notice === next) return;
  notice = next;
  noticeListeners.forEach(listener => listener());
}

export function hideRecoveryNotice() {
  setNotice(null);
}

export function recoveryNotice(): RecoveryNotice {
  return notice;
}

export function subscribeRecoveryNotice(listener: () => void) {
  noticeListeners.add(listener);
  return () => void noticeListeners.delete(listener);
}
