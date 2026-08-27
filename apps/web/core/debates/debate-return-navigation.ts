'use client';

const debateReturnDestinationKey = 'geo.debates.return-destination';
const debateReturnDestinationMaxAgeMs = 6 * 60 * 60 * 1_000;

type StoredDebateReturnDestination = {
  href: string;
  capturedAt: number;
};

/**
 * Remember the page that opened a live debate flow. Debate room and rematch
 * transitions intentionally do not overwrite it, so one destination survives
 * recording -> debate again -> recording until the flow actually exits.
 */
export function rememberDebateReturnDestination(href = currentBrowserHref()) {
  const destination = safeInternalHref(href);
  if (!destination || isDebateFlowHref(destination)) return;

  try {
    window.sessionStorage.setItem(
      debateReturnDestinationKey,
      JSON.stringify({ href: destination, capturedAt: Date.now() } satisfies StoredDebateReturnDestination)
    );
  } catch {
    // Browser storage can be unavailable in privacy modes. Existing history
    // and route fallbacks still handle the exit in that case.
  }
}

/** Read and clear the destination so a later, unrelated debate cannot reuse it. */
export function consumeDebateReturnDestination(): string | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(debateReturnDestinationKey);
    window.sessionStorage.removeItem(debateReturnDestinationKey);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const stored = JSON.parse(raw) as Partial<StoredDebateReturnDestination>;
    if (typeof stored.href !== 'string' || typeof stored.capturedAt !== 'number') return null;
    if (Date.now() - stored.capturedAt > debateReturnDestinationMaxAgeMs) return null;
    const destination = safeInternalHref(stored.href);
    return destination && !isDebateFlowHref(destination) ? destination : null;
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

function safeInternalHref(href: string): string | null {
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
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'space' && segments[2] === 'debates' && segments.length > 3;
}
