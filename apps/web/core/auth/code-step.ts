'use client';

import { type AnalyticsProperties } from '~/core/analytics';
import { type AuthAttempt, attemptProperties, captureAuthEvent, currentAuthAttempt } from '~/core/auth-attempt';

// GEO-3573. Kept in localStorage for ten minutes: Privy's `loginWithCode` only works in the document
// that sent the code, so a new page can only reopen sign-in prefilled. The address never leaves the device.

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
  /** When its owner (`claimedBy`, else `documentId`) fired `pagehide`. Cleared if it comes back. */
  ownerGoneAt?: number;
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

/** The document holding the code: the one that claimed it, else the one that sent it. */
function owner(pending: PendingCode) {
  return pending.claimedBy ?? pending.documentId;
}

/** How long a page waits for the code's owner to answer before treating it as gone. */
export const OWNER_PING_TIMEOUT_MS = 300;

type OwnerState = 'checking' | 'alive' | 'gone';
let ownerCheck: { owner: string; state: OwnerState } | null = null;
const ownerCheckListeners = new Set<() => void>();

function settleOwnerCheck(checked: string, state: OwnerState) {
  if (ownerCheck?.owner !== checked || ownerCheck.state !== 'checking') return;
  ownerCheck.state = state;
  ownerCheckListeners.forEach(listener => listener());
}

const channel =
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('geo:auth-code-step')
    : null;

// A page still open (a background desktop tab, say) answers for its code, so a new tab leaves it
// alone. A suspended or closed one cannot, which is the iPhone case recovery is for.
channel?.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as { type?: string; owner?: string } | null;
  if (message?.type === 'alive' && message.owner) return settleOwnerCheck(message.owner, 'alive');
  if (message?.type !== 'ping' || message.owner !== DOCUMENT_ID) return;
  const pending = readPendingCode();
  if (pending && owner(pending) === DOCUMENT_ID) channel.postMessage({ type: 'alive', owner: DOCUMENT_ID });
});

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const pending = readPendingCode();
    if (pending && owner(pending) === DOCUMENT_ID) write({ ...pending, ownerGoneAt: Date.now() });
  });
  // Back from the back-forward cache: still the owner unless another page claimed it meanwhile.
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    const pending = readPendingCode();
    if (pending && owner(pending) === DOCUMENT_ID && pending.ownerGoneAt !== undefined) {
      write({ ...pending, ownerGoneAt: undefined });
    }
  });
}

function ownerState(pending: PendingCode): OwnerState {
  if (pending.ownerGoneAt !== undefined || !channel) return 'gone';
  const checked = owner(pending);
  if (ownerCheck?.owner === checked) return ownerCheck.state;
  ownerCheck = { owner: checked, state: 'checking' };
  channel.postMessage({ type: 'ping', owner: checked });
  setTimeout(() => settleOwnerCheck(checked, 'gone'), OWNER_PING_TIMEOUT_MS);
  return 'checking';
}

/** A code held by another page, live or not: enough to start loading Privy for a likely recovery. */
export function pendingCodeElsewhere(): PendingCode | null {
  const pending = readPendingCode();
  return pending && owner(pending) !== DOCUMENT_ID ? pending : null;
}

/** Resolves once this page knows whether the code's owner is still open. */
export function codeOwnerChecked(): Promise<void> {
  const pending = pendingCodeElsewhere();
  if (!pending || ownerState(pending) !== 'checking') return Promise.resolve();
  return new Promise(resolve => {
    const listener = () => {
      ownerCheckListeners.delete(listener);
      resolve();
    };
    ownerCheckListeners.add(listener);
  });
}

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

/** The announced send failed; whatever is sent next reads its own address. */
export function forgetAnnouncedCodeEmail() {
  announcedEmail = null;
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
  // A code sent from a recovered dialog is still that recovery, but this document's own code now,
  // unclaimed, so the next page can pick it up again.
  const recoveryAttemptId =
    previous && (previous.claimedBy === DOCUMENT_ID || previous.documentId === DOCUMENT_ID)
      ? previous.recoveryAttemptId
      : undefined;
  const recovering = recoveryAttemptId !== undefined;
  const pending: PendingCode = {
    attemptId: attempt?.id,
    email: announcedEmail ?? normalize(fieldEmail),
    sentAt: Date.now(),
    documentId: DOCUMENT_ID,
    properties: attempt ? entryAttribution(attempt.properties) : {},
    ...(recovering ? { recoveryAttemptId } : {}),
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
 * A code another page holds, inside the window, whose page is gone (reloaded, closed, suspended).
 * Null while that is still being checked; see `codeOwnerChecked`.
 */
export function reloadedCodeStep(): PendingCode | null {
  const pending = pendingCodeElsewhere();
  return pending && ownerState(pending) === 'gone' ? pending : null;
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
  write({ ...pending, claimedBy: DOCUMENT_ID, leftAt: undefined, ownerGoneAt: undefined });
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

// Ask early, so the answer is in by the time Privy is ready to open a recovered sign-in.
if (pendingCodeElsewhere()) reloadedCodeStep();
