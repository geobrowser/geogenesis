'use client';

import { type AnalyticsProperties } from '~/core/analytics';
import {
  type AuthAttempt,
  attemptProperties,
  captureAuthEvent,
  currentAuthAttempt,
  isSignedInOutcome,
} from '~/core/auth-attempt';
import { devLog } from '~/core/utils/dev-log';

// GEO-3573. Kept in localStorage for ten minutes: Privy's `loginWithCode` only works in the document
// that sent the code, so a new page can only reopen sign-in prefilled. The address never leaves the device.
// Only a page with evidence it is the same visitor picks it up (`mayPickUp`): the same tab, or a sign-in
// link opened soon after. Any other page leaves it alone, so the next person on a shared browser never sees it.

const KEY = 'geo:auth-code-step:v1';
/** Per document that held the code and fired `pagehide`; kept apart so that write never touches the record. */
const GONE_PREFIX = 'geo:auth-code-step:gone:';
/** This tab's id, in sessionStorage: it survives a reload of the tab, not a new tab. */
const TAB_KEY = 'geo:auth-code-step:tab';
/** Serializes every change to the record across documents. */
const LOCK = 'geo:auth-code-step';

/** How long after the code was sent the same tab, reloaded, still picks up where it left off. */
export const CODE_RECOVERY_WINDOW_MS = 10 * 60 * 1000;

/** How long after the code was sent a new tab's sign-in link still picks it up (the mail link tapped again). */
export const LINK_RECOVERY_WINDOW_MS = 5 * 60 * 1000;

/** The triggers of a sign-in that a link opened. */
const LINK_TRIGGERS = new Set(['deep_link', 'invite_link']);

export const AUTH_STEP_EVENT = 'experimental.auth_step';

/**
 * Off until the analytics registry's `auth_step` contract is deployed: the collector rejects a
 * growth-v2 event it has no contract for, failing its batch. Until then the payload is only logged.
 */
const SEND_AUTH_STEP = false;

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
  /** The tab that sent it (`TAB_KEY`), so a reload of that tab may pick it up. */
  tabId?: string;
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

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());
}

const DOCUMENT_ID = newId();

const TAB_ID: string | null = (() => {
  try {
    const existing = sessionStorage.getItem(TAB_KEY);
    if (existing) return existing;
    const id = newId();
    sessionStorage.setItem(TAB_KEY, id);
    return id;
  } catch {
    return null;
  }
})();

/** Runs `fn` holding the cross-document lock; without Web Locks, at once. */
function locked<T>(fn: () => T): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) {
    try {
      return Promise.resolve(fn());
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return locks.request(LOCK, () => fn());
}

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

/** This document gave up a claim no sign-in here could use; coming back from the cache doesn't retake it. */
let releasedClaim = false;

// pagehide can't wait for the lock, so it writes only this document's own key, never the record:
// a claim another page makes meanwhile can't be overwritten by it.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const pending = readPendingCode();
    if (pending && owner(pending) === DOCUMENT_ID) markGone(DOCUMENT_ID);
  });
  // Back from the back-forward cache: the owner again, unless another page claimed it meanwhile.
  window.addEventListener('pageshow', event => {
    if (event.persisted && !releasedClaim) unmarkGone(DOCUMENT_ID);
  });
}

function markGone(documentId: string) {
  try {
    localStorage.setItem(GONE_PREFIX + documentId, String(Date.now()));
  } catch {
    /* Without storage the ping still finds it gone. */
  }
}

function unmarkGone(documentId: string) {
  try {
    localStorage.removeItem(GONE_PREFIX + documentId);
  } catch {
    /* Nothing was written either. */
  }
}

function isMarkedGone(documentId: string) {
  try {
    return localStorage.getItem(GONE_PREFIX + documentId) !== null;
  } catch {
    return false;
  }
}

function clearGoneMarks() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(GONE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* Storage is optional. */
  }
}

function ownerState(pending: PendingCode): OwnerState {
  if (isMarkedGone(owner(pending)) || !channel) return 'gone';
  const checked = owner(pending);
  if (ownerCheck?.owner === checked) return ownerCheck.state;
  ownerCheck = { owner: checked, state: 'checking' };
  channel.postMessage({ type: 'ping', owner: checked });
  setTimeout(() => settleOwnerCheck(checked, 'gone'), OWNER_PING_TIMEOUT_MS);
  return 'checking';
}

/** The same tab that sent the code, reloaded or restored. */
function sameTab(pending: PendingCode) {
  return TAB_ID !== null && pending.tabId === TAB_ID;
}

/** Arrived on a link soon enough after the code was sent to be the visitor coming back from the email. */
function linkInWindow(pending: PendingCode, now = Date.now()) {
  return landedOnModalLink() && now - pending.sentAt < LINK_RECOVERY_WINDOW_MS;
}

/**
 * Whether this page may pick `pending` up: the same tab, or a link opened inside the link window.
 * `trigger` narrows the link case to a sign-in the link itself opened; omitted, it asks whether one might.
 */
function mayPickUp(pending: PendingCode, trigger?: unknown) {
  if (sameTab(pending)) return true;
  if (!linkInWindow(pending)) return false;
  return trigger === undefined || (typeof trigger === 'string' && LINK_TRIGGERS.has(trigger));
}

/** A code held by another page, live or not, that this page may pick up: enough to start loading Privy. */
export function pendingCodeElsewhere(): PendingCode | null {
  const pending = readPendingCode();
  return pending && owner(pending) !== DOCUMENT_ID && mayPickUp(pending) ? pending : null;
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
      clearGoneMarks();
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
    else {
      localStorage.removeItem(KEY);
      clearGoneMarks();
    }
  } catch {
    /* Storage is optional; without it there is nothing to recover. */
  }
}

function capture(step: AuthStep, pending: PendingCode, extra: AnalyticsProperties = {}) {
  const attempt = currentAuthAttempt();
  const payload: AnalyticsProperties = {
    ...pending.properties,
    ...(attempt ? attemptProperties(attempt) : {}),
    auth_step: step,
    code_attempt_id: pending.attemptId ?? null,
    // The registry rejects a negative or fractional age; a clock set back can produce one.
    code_age_ms: Math.max(0, Math.round(Date.now() - pending.sentAt)),
    ...extra,
  };
  if (SEND_AUTH_STEP) captureAuthEvent(AUTH_STEP_EVENT, payload);
  else devLog('[auth_step]', payload);
}

/** Privy reports the code sent. `fieldEmail` is what its dialog's address field held, if any. */
export function codeScreenShown(fieldEmail?: string | null) {
  const attempt = currentAuthAttempt();
  const email = announcedEmail ?? normalize(fieldEmail);
  announcedEmail = null;
  setNotice(null);
  void locked(() => {
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
      email,
      sentAt: Date.now(),
      documentId: DOCUMENT_ID,
      ...(TAB_ID ? { tabId: TAB_ID } : {}),
      properties: attempt ? entryAttribution(attempt.properties) : {},
      ...(recovering ? { recoveryAttemptId } : {}),
    };
    write(pending);
    clearGoneMarks();
    capture('code_screen_shown', pending, { recovered: recovering });
  });
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
  const leftAt = Date.now();
  void locked(() => {
    const pending = readPendingCode();
    if (!ownCode(pending) || pending.leftAt !== undefined) return;
    const left = { ...pending, leftAt };
    write(left);
    capture('left_code_screen', left);
  });
}

/** Back in view without a new page. */
export function codeStepVisible() {
  const back = Date.now();
  void locked(() => {
    const pending = readPendingCode();
    if (!ownCode(pending) || pending.leftAt === undefined) return;
    write({ ...pending, leftAt: undefined });
    capture('returned_to_code_screen', pending, { returned_to: 'same_page', away_ms: back - pending.leftAt });
  });
}

/**
 * A code another page holds, inside the window, whose page is gone (reloaded, closed, suspended).
 * Null while that is still being checked; see `codeOwnerChecked`.
 */
export function reloadedCodeStep(): PendingCode | null {
  const pending = pendingCodeElsewhere();
  return pending && ownerState(pending) === 'gone' ? pending : null;
}

/** This document's claim on a code another page sent, once it is confirmed. */
function heldClaim(): PendingCode | null {
  const current = readPendingCode();
  return current?.claimedBy === DOCUMENT_ID && current.documentId !== DOCUMENT_ID ? current : null;
}

let claim: Promise<PendingCode | null> | null = null;
/** A sign-in this document opened has used the claim, or opened without it; either way it is settled. */
let claimSettled = false;

/**
 * Claims the code step another page left, once its owner is known to be gone. Under the lock the
 * record is read again, so of two pages racing only the first claims; the other finds an owner it
 * has not checked and stops. Resolves to the claim, or null.
 */
export function claimCodeRecovery(): Promise<PendingCode | null> {
  claim ??= codeOwnerChecked().then(() =>
    locked(() => {
      if (claimSettled) return null;
      const held = heldClaim();
      if (held) return held;
      const pending = reloadedCodeStep();
      if (!pending) return null;
      write({ ...pending, claimedBy: DOCUMENT_ID, leftAt: undefined });
      // Without Web Locks there is no compare-and-set; a tab that lost the race reads the winner's claim here.
      const claimed = heldClaim();
      if (!claimed) return null;
      capture('returned_to_code_screen', pending, {
        returned_to: 'new_page',
        away_ms: Date.now() - (pending.leftAt ?? pending.sentAt),
      });
      return claimed;
    })
  );
  return claim;
}

/**
 * For a sign-in being opened with `properties`: the code step this document claimed, if this sign-in
 * may pick it up (`mayPickUp`). Null otherwise; a claim this sign-in can't use is released.
 */
export function takeCodeRecovery(properties: AnalyticsProperties = {}): PendingCode | null {
  const held = heldClaim();
  const usable = held && mayPickUp(held, properties.auth_trigger ?? null) ? held : null;
  if (!claimSettled && held && !usable) {
    releasedClaim = true;
    markGone(DOCUMENT_ID);
  }
  claimSettled = true;
  return usable;
}

/**
 * This page may pick a code step up: one another page holds, or one it has claimed already (the
 * claim starts at load and can finish before the first render).
 */
export function codeRecoveryExpected(): boolean {
  return pendingCodeElsewhere() !== null || heldClaim() !== null;
}

/** A claim this document holds that no sign-in has used yet, for the same tab to reopen sign-in with. */
export function codeRecoveryWaiting(): PendingCode | null {
  const held = claimSettled ? null : heldClaim();
  return held && sameTab(held) ? held : null;
}

/** Marks the sign-in that picks `pending` up; its entry's own attribution is `pending.properties`. */
export function codeRecoveryProperties(pending: PendingCode): AnalyticsProperties {
  return { auth_recovery: 'reloaded_code_step', recovered_attempt_id: pending.attemptId ?? null };
}

/** Sign-in has been reopened for `pending`, as attempt `attemptId`. */
export function codeRecoveryOffered(pending: PendingCode, attemptId: string | undefined) {
  setNotice({ email: pending.email });
  void locked(() => {
    const held = heldClaim();
    if (!held) return;
    const offered = { ...held, recoveryAttemptId: attemptId };
    write(offered);
    capture('recovery_offered', offered, { prefilled: Boolean(pending.email) });
  });
}

/**
 * An attempt in this document ended. A sign-in ends the code step, and so does closing sign-in on a
 * page that may pick the code up; a close anywhere else leaves it for its owner. Reported as finished
 * when the attempt was the code's own or its recovery's.
 */
export function codeStepAttemptEnded(attempt: AuthAttempt) {
  const outcome = attempt.outcome;
  if (!outcome || outcome === 'superseded') return;
  void locked(() => {
    const pending = readPendingCode();
    if (!pending) return;
    const own = attempt.id === pending.attemptId || attempt.id === pending.recoveryAttemptId;
    const ours = own || owner(pending) === DOCUMENT_ID || sameTab(pending);
    if (!isSignedInOutcome(outcome) && !ours) return;
    write(null);
    setNotice(null);
    if (own) capture('finished', pending, { outcome, recovered: Boolean(pending.recoveryAttemptId) });
  });
}

/** Signed in or out: nothing is left to pick up. */
export function clearCodeStep() {
  announcedEmail = null;
  setNotice(null);
  void locked(() => write(null));
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

// Claim early, so it is settled by the time Privy is ready to open a recovered sign-in.
if (pendingCodeElsewhere()) void claimCodeRecovery();
