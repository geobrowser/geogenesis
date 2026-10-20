'use client';

import * as React from 'react';

import { getState, isRealAuthWanted, markHostFailed, requestRealAuth, subscribe } from './auth-store';

/**
 * How long after load a signed-out page waits before loading Privy anyway.
 *
 * The session check in `privy-session.ts` reads Privy's own storage, so this should rarely be what
 * loads it; it is the way back for a session the check missed (and for anything waiting on a Privy
 * that nobody has asked for yet). Long enough that it stays out of the page's first load, short
 * enough that a missed session is not signed out for long. Then `requestIdleCallback`, so it still
 * waits for a quiet main thread.
 */
export const IDLE_LOAD_DELAY_MS = 8_000;
const IDLE_CALLBACK_TIMEOUT_MS = 2_000;

type HostModule = typeof import('./privy-host');
let hostModule: Promise<HostModule> | null = null;

function loadHost() {
  hostModule ??= import('./privy-host');
  return hostModule;
}

// A reader with a session needs Privy as soon as possible, so the chunk starts downloading while
// the page is still hydrating rather than after it.
if (typeof window !== 'undefined' && isRealAuthWanted()) void loadHost();

export function scheduleIdleLoad(onIdle: () => void, delayMs = IDLE_LOAD_DELAY_MS) {
  let idleHandle: number | undefined;
  const timer = setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(onIdle, { timeout: IDLE_CALLBACK_TIMEOUT_MS });
    } else {
      onIdle();
    }
  }, delayMs);
  return () => {
    clearTimeout(timer);
    if (idleHandle !== undefined) window.cancelIdleCallback?.(idleHandle);
  };
}

/**
 * Mounts Privy (and wagmi, and the embedded-wallet sync) when it is wanted: a session was found, a
 * sign-in was asked for, or the idle timer ran. Renders nothing otherwise.
 */
export function AuthRoot() {
  const wanted = React.useSyncExternalStore(subscribe, isRealAuthWanted, () => false);
  const attempt = React.useSyncExternalStore(
    subscribe,
    () => getState().hostAttempt,
    () => 0
  );
  const [Host, setHost] = React.useState<HostModule['default'] | null>(null);

  React.useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    loadHost().then(
      module => {
        if (!cancelled) setHost(() => module.default);
      },
      error => {
        console.error('[auth] could not load Privy', error);
        hostModule = null;
        markHostFailed();
      }
    );
    return () => {
      cancelled = true;
    };
  }, [wanted, attempt]);

  React.useEffect(() => {
    if (wanted) return;
    return scheduleIdleLoad(requestRealAuth);
  }, [wanted]);

  return Host ? <Host /> : null;
}
