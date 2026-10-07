'use client';

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
  try {
    window.sessionStorage.setItem(debateReturnDestinationKey, JSON.stringify(stored));
  } catch {
    // Browser storage can be unavailable in privacy modes. Existing history
    // and route fallbacks still handle the exit in that case.
  }
}

/** Read and clear the destination so a later, unrelated debate cannot reuse it. */
export function consumeDebateReturnDestination(): string | null {
  const destination = peekDebateReturnDestination();
  clearDebateReturnDestination();
  return destination;
}

/** The destination the flow will return to, left in place. */
export function peekDebateReturnDestination(): string | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(debateReturnDestinationKey);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as Partial<StoredDebateReturnDestination>;
    if (typeof stored.href !== 'string' || typeof stored.capturedAt !== 'number') return null;
    if (Date.now() - stored.capturedAt > debateReturnDestinationMaxAgeMs) return null;
    const destination = safeInternalHref(stored.href);
    if (!destination) return null;
    if (stored.lobby === true) return isDebateRoomPath(destination) ? destination : null;
    return isDebateFlowHref(destination) ? null : destination;
  } catch {
    return null;
  }
}

export function clearDebateReturnDestination() {
  try {
    window.sessionStorage.removeItem(debateReturnDestinationKey);
  } catch {
    // Nothing to clear when storage is unavailable.
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
