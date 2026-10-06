'use client';

import * as React from 'react';

import { type DebateRoomTabPriority, debateRoomTabPriority } from './debate-room-ownership';

/**
 * Which of a viewer's open tabs a debate flow belongs to (GEO-3149).
 *
 * Several things move a tab into a debate room without the viewer asking that tab to: a debate-again
 * session converting under the picker, a room left idle behind another tab following that session,
 * the room's own "go to the picker" step. Every open tab ran them, so a viewer with Geo open twice
 * had both tabs walk into the room together, and room ownership then had to pick one of them —
 * sometimes the one in the background.
 *
 * A claim says "this tab is in, or on its way into, this flow". It lives in localStorage, so every
 * tab of the browser profile reads the same record, and it is short-lived, so a tab that closes
 * without cleaning up stops counting within `DEBATE_TAB_CLAIM_TTL_MS`. The room keeps its own claim
 * fresh for as long as it holds the connection.
 *
 * Automatic moves go through `claimDebateEntry`: the tab the viewer is looking at claims and goes at
 * once; any other tab waits briefly, then goes only if no other tab claimed the flow first. A tab that
 * loses shows a notice with a way in instead of moving. Explicit moves (Join, Open here) always go.
 *
 * Everything fails open: without storage, the old every-tab behaviour returns, which room ownership
 * still arbitrates.
 */

export type DebateTabClaimKey = `debate:${string}` | `rematch:${string}`;

type DebateTabClaim = { tabId: string; at: number };

const STORAGE_PREFIX = 'geo:debate-tab-claim:';
export const DEBATE_TAB_CLAIM_TTL_MS = 30_000;
export const DEBATE_TAB_CLAIM_REFRESH_MS = 10_000;

// Long enough for the tab the viewer is looking at to reach its own claim first — including the
// room tab that still has a recording to save before it navigates — short enough that a lone
// background tab still walks in well inside the intro.
const entryStaggerMs: Record<DebateRoomTabPriority, number> = { 0: 1_500, 1: 400, 2: 0 };

export function debateRoomClaimKey(debateId: string): DebateTabClaimKey {
  return `debate:${debateId}`;
}

export function debateRematchClaimKey(sessionId: string): DebateTabClaimKey {
  return `rematch:${sessionId}`;
}

/** The claim key for where a debate-again session sends the viewer next. */
export function debateRematchDestinationClaimKey(session: {
  id: string;
  status: string;
  converted_debate_id?: string | null;
}): DebateTabClaimKey {
  return session.status === 'converted' && session.converted_debate_id
    ? debateRoomClaimKey(session.converted_debate_id)
    : debateRematchClaimKey(session.id);
}

function createTabId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let currentTabId: string | null = null;

/** This document's id. A reload is a new tab as far as claims go, which is what a reload is. */
export function debateTabId() {
  currentTabId ??= createTabId();
  return currentTabId;
}

/** Test seam. */
export function resetDebateTabIdForTests(tabId?: string) {
  currentTabId = tabId ?? null;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readClaim(key: DebateTabClaimKey): DebateTabClaim | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DebateTabClaim> | null;
    if (!parsed || typeof parsed.tabId !== 'string' || typeof parsed.at !== 'number') return null;
    return { tabId: parsed.tabId, at: parsed.at };
  } catch {
    return null;
  }
}

/** Records that this tab is in, or on its way into, the flow. */
export function writeDebateTabClaim(key: DebateTabClaimKey, now = Date.now()) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_PREFIX + key, JSON.stringify({ tabId: debateTabId(), at: now } satisfies DebateTabClaim));
    notify();
  } catch {
    // Storage full or blocked: claims are an optimisation over room ownership, never a gate.
  }
}

/** Gives the flow up, but only if this tab is the one holding it. */
export function clearDebateTabClaim(key: DebateTabClaimKey) {
  const store = storage();
  if (!store) return;
  try {
    if (readClaim(key)?.tabId !== debateTabId()) return;
    store.removeItem(STORAGE_PREFIX + key);
    notify();
  } catch {
    // Best effort; the claim expires on its own.
  }
}

/** Whether another, still-live tab holds the flow. */
export function hasForeignDebateTabClaim(key: DebateTabClaimKey, now = Date.now()) {
  const claim = readClaim(key);
  return Boolean(claim && claim.tabId !== debateTabId() && now - claim.at < DEBATE_TAB_CLAIM_TTL_MS);
}

type ClaimDebateEntryOptions = {
  /** Test seam; production reads visibility and focus. */
  getPriority?: () => DebateRoomTabPriority;
  /** Settles the wait early with a loss, e.g. on unmount. */
  signal?: AbortSignal;
};

/**
 * Decides whether this tab should follow an automatic move into the flow, and claims it if so.
 *
 * Resolves true when this tab should go, false when another tab already has the flow and this one
 * should offer a way in instead.
 */
export async function claimDebateEntry(
  key: DebateTabClaimKey,
  { getPriority = debateRoomTabPriority, signal }: ClaimDebateEntryOptions = {}
): Promise<boolean> {
  if (!storage()) return true;
  const priority = getPriority();
  // The tab in front of the viewer always goes, and takes the flow from wherever it was.
  if (priority === 2) {
    writeDebateTabClaim(key);
    return true;
  }
  await waitForAttentionOrTimeout(entryStaggerMs[priority], getPriority, signal);
  if (signal?.aborted) return false;
  return decideUnderLock(key, () => {
    // Focus may have arrived during the wait; that tab wins outright, as above.
    if (getPriority() !== 2 && hasForeignDebateTabClaim(key)) return false;
    writeDebateTabClaim(key);
    return true;
  });
}

async function decideUnderLock(key: DebateTabClaimKey, decide: () => boolean): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (typeof locks?.request !== 'function') return decide();
  try {
    // Two background tabs whose waits end together must not both read "unclaimed" and both go.
    return await locks.request(`${STORAGE_PREFIX}${key}`, { mode: 'exclusive' }, () => decide());
  } catch {
    return decide();
  }
}

function waitForAttentionOrTimeout(delay: number, getPriority: () => DebateRoomTabPriority, signal?: AbortSignal) {
  return new Promise<void>(resolve => {
    if (delay <= 0 || typeof window === 'undefined' || signal?.aborted) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('focus', onAttention);
      document.removeEventListener('visibilitychange', onAttention);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const onAttention = () => {
      if (getPriority() === 2) finish();
    };
    const timer = window.setTimeout(finish, delay);
    window.addEventListener('focus', onAttention);
    document.addEventListener('visibilitychange', onAttention);
    signal?.addEventListener('abort', finish);
  });
}

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  // Claims expire by time as well as by writes; a slow tick catches a tab that closed uncleanly.
  const interval = window.setInterval(listener, DEBATE_TAB_CLAIM_REFRESH_MS);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
    window.clearInterval(interval);
  };
}

/** Whether another live tab holds the flow, kept current across tabs. False for a null key. */
export function useForeignDebateTabClaim(key: DebateTabClaimKey | null) {
  const getSnapshot = React.useCallback(() => (key ? hasForeignDebateTabClaim(key) : false), [key]);
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Holds the flow for this tab while `active`, refreshing the claim so it never goes stale under a
 * tab that is still there, and giving it up when `active` ends, on unmount, and on pagehide.
 */
export function useHoldDebateTabClaim(key: DebateTabClaimKey | null, active: boolean) {
  React.useEffect(() => {
    if (!key || !active) return;
    writeDebateTabClaim(key);
    const interval = window.setInterval(() => writeDebateTabClaim(key), DEBATE_TAB_CLAIM_REFRESH_MS);
    const onPageHide = () => clearDebateTabClaim(key);
    const onPageShow = () => writeDebateTabClaim(key);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      clearDebateTabClaim(key);
    };
  }, [active, key]);
}
