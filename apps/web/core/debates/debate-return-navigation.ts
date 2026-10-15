'use client';

import { currentNavigationType } from '~/core/utils/navigation-type';

import { debateRoomPath, isDebateRoomPath } from './rooms/room-routes';

const debateReturnDestinationKey = 'geo.debates.return-destination';
const debateReturnDestinationMaxAgeMs = 6 * 60 * 60 * 1_000;

type StoredDebateReturnDestination = {
  href: string;
  capturedAt: number;
  /** A lobby, which shares the room path but is a place to come back to. */
  lobby?: true;
};

/**
 * Remember the page that opened a live debate flow. Debate room and rematch
 * transitions intentionally do not overwrite it, so one destination survives
 * recording -> debate again -> recording until the flow actually exits.
 */
export function rememberDebateReturnDestination(href = currentBrowserHref()) {
  const destination = safeInternalHref(href);
  if (!destination || isDebateFlowHref(destination)) return;
  storeDestination({ href: destination, capturedAt: Date.now() });
}

/** Remember a lobby, stepped out of to debate, as the place the flow returns to. */
export function rememberLobbyReturnDestination(lobbyId: string) {
  storeDestination({ href: debateRoomPath(lobbyId), capturedAt: Date.now(), lobby: true });
}

function storeDestination(stored: StoredDebateReturnDestination) {
  // Without storage, existing history and route fallbacks still handle the exit.
  writeSession(debateReturnDestinationKey, JSON.stringify(stored));
}

/**
 * Read and clear the destination so a later, unrelated debate cannot reuse it. `lobby`, geo-chat's
 * answer when known, overrides any stored lobby; without it this tab's record decides.
 */
export function consumeDebateReturnDestination(lobby?: { lobbyId: string | null }): string | null {
  const stored = readStoredDestination();
  clearDebateReturnDestination();
  if (!lobby) return stored?.href ?? null;
  if (lobby.lobbyId) return debateRoomPath(lobby.lobbyId);
  return stored && !stored.lobby ? stored.href : null;
}

/** The destination the flow will return to, left in place. */
export function peekDebateReturnDestination(): string | null {
  return readStoredDestination()?.href ?? null;
}

function readStoredDestination(): { href: string; lobby: boolean } | null {
  const raw = readSession(debateReturnDestinationKey);
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as Partial<StoredDebateReturnDestination>;
    if (typeof stored.href !== 'string' || typeof stored.capturedAt !== 'number') return null;
    if (Date.now() - stored.capturedAt > debateReturnDestinationMaxAgeMs) return null;
    const destination = safeInternalHref(stored.href);
    if (!destination) return null;
    if (stored.lobby === true) return isDebateRoomPath(destination) ? { href: destination, lobby: true } : null;
    return isDebateFlowHref(destination) ? null : { href: destination, lobby: false };
  } catch {
    return null;
  }
}

export function clearDebateReturnDestination() {
  removeSession(debateReturnDestinationKey);
}

const lastPageOutsideDebatesKey = 'geo.debates.last-page-outside';
/** A page was recorded since this document loaded, so the stored one is from this visit. */
let recordedInThisDocument = false;

/**
 * Every page that is not a debate surface, so leaving a lobby lands where it was opened from. A
 * debate stepped out to from the lobby is skipped, so it never stands in for that page.
 */
export function rememberLastPageOutsideDebates(href = currentBrowserHref()) {
  const page = safeInternalHref(href);
  // Without storage, leaving a lobby falls back to Explore.
  if (!page || isDebateFlowHref(page)) return;
  writeSession(lastPageOutsideDebatesKey, page);
  recordedInThisDocument = true;
}

/**
 * The last page this tab was on outside the debate surfaces, or null. A lobby opened straight from
 * outside the app (a pasted or shared link) has none: the tab's page from an earlier visit is
 * forgotten. A reload or Back into the lobby keeps it.
 */
export function lastPageOutsideDebates(): string | null {
  if (!recordedInThisDocument && !documentRestored()) {
    removeSession(lastPageOutsideDebatesKey);
    return null;
  }
  const stored = readSession(lastPageOutsideDebatesKey);
  const page = stored ? safeInternalHref(stored) : null;
  return page && !isDebateFlowHref(page) ? page : null;
}

function documentRestored() {
  const type = currentNavigationType();
  return type === 'reload' || type === 'back_forward';
}

/** Session storage can be unavailable in privacy modes; these treat that as empty. */
function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Nothing to keep it in.
  }
}

function removeSession(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

function currentBrowserHref() {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** An href on this site, or null: `//host` is protocol-relative and would leave the app. */
export function safeInternalHref(href: string): string | null {
  if (!href.startsWith('/') || href.startsWith('//')) return null;
  try {
    const url = new URL(href, 'https://geo.local');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function isDebateFlowHref(href: string) {
  const pathname = href.split(/[?#]/, 1)[0];
  // A room is a debate surface like the rest: captured as a destination, it saves itself as its
  // own, and leaving lands back in it.
  if (isDebateRoomPath(pathname)) return true;

  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'space' && segments[2] === 'debates' && segments.length > 3;
}
