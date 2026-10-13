'use client';

import * as React from 'react';

/**
 * How long after `load` the page may wait for an idle moment before it is called settled.
 *
 * `requestIdleCallback` only fires once the main thread has nothing to do, which on a phone that is
 * still hydrating can be a while. The timeout is the most that wait is allowed to cost.
 */
export const SETTLE_IDLE_TIMEOUT_MS = 1_500;

/**
 * How long the page's largest-contentful-paint candidates must stay quiet before it is settled.
 *
 * `load` is not enough on its own: the Explore feed is fetched after hydration, so on a phone its
 * first cards (and the biggest element on screen) arrive after `load` has already fired. Measured on
 * the Vercel preview, settling on `load` alone attached the recordings at ~2.9s while the largest
 * contentful paint landed at 3.2s. Each new candidate pushes the settle back by this much.
 */
export const SETTLE_LCP_QUIET_MS = 1_000;

/**
 * The most the page can stay unsettled, whatever else happens. A third-party script that holds
 * `load` open for ever must not be able to keep every video in the feed off.
 */
export const SETTLE_MAX_WAIT_MS = 8_000;

/** Input that means a person is here and about to look at something: they get video now. */
const INTENT_EVENTS = ['pointerdown', 'touchstart', 'touchmove', 'wheel', 'keydown'] as const;

let settled = false;
let started = false;
const listeners = new Set<() => void>();

function settle() {
  if (settled) return;
  settled = true;
  for (const listener of listeners) listener();
}

/**
 * Watch for the first of: the window's `load` followed by an idle moment and an LCP-quiet window, a person touching,
 * scrolling or typing, or the hard cap. Installed once, on the first subscriber, and never torn
 * down — the answer only ever goes from false to true for the life of the page, so a later
 * navigation inside the app finds it already settled.
 *
 * `scroll` is deliberately not one of the signals: the browser fires it for restoring a scroll
 * position, which is not anybody asking for anything. `wheel` and `touchmove` are the viewer's own.
 */
function start() {
  if (started || settled) return;
  started = true;

  const cleanups: Array<() => void> = [];
  const finish = () => {
    for (const cleanup of cleanups) cleanup();
    settle();
  };

  for (const type of INTENT_EVENTS) {
    window.addEventListener(type, finish, { passive: true, capture: true, once: true });
    cleanups.push(() => window.removeEventListener(type, finish, { capture: true }));
  }

  const maxTimer = setTimeout(finish, SETTLE_MAX_WAIT_MS);
  cleanups.push(() => clearTimeout(maxTimer));

  // The latest moment the page's largest-contentful-paint candidate changed (ms since navigation).
  let lastLcpAt = 0;
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) lastLcpAt = Math.max(lastLcpAt, entry.startTime);
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      cleanups.push(() => observer.disconnect());
    } catch {
      // An engine without LCP entries (Safari) has no candidates to wait out; load plus idle stands.
    }
  }

  // Settled once nothing has painted a new largest candidate for a quiet window, counted from the
  // later of that candidate and now (which, just after load, is the load).
  let quietFrom = 0;
  const waitForQuiet = () => {
    quietFrom = Math.max(quietFrom, performance.now());
    const check = () => {
      const remaining = Math.max(lastLcpAt, quietFrom) + SETTLE_LCP_QUIET_MS - performance.now();
      if (remaining <= 0) return finish();
      const timer = setTimeout(check, remaining);
      cleanups.push(() => clearTimeout(timer));
    };
    check();
  };

  const afterLoad = () => {
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(waitForQuiet, { timeout: SETTLE_IDLE_TIMEOUT_MS });
      cleanups.push(() => window.cancelIdleCallback?.(handle));
    } else {
      // Safari has no requestIdleCallback; a short timer lets the load handlers finish first.
      const timer = setTimeout(waitForQuiet, 200);
      cleanups.push(() => clearTimeout(timer));
    }
  };

  if (document.readyState === 'complete') {
    afterLoad();
  } else {
    window.addEventListener('load', afterLoad, { once: true });
    cleanups.push(() => window.removeEventListener('load', afterLoad));
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => settled;
// False on the server, and for the hydrating render, so markup matches before it changes.
const getServerSnapshot = () => false;

/** Test-only: forget everything, so a test can watch the page settle from the start. */
export function resetPageSettledForTests() {
  settled = false;
  started = false;
  listeners.clear();
}

/**
 * Whether the page has finished its own loading, so heavy optional media may start.
 *
 * False until the first of: `load` plus an idle moment plus a quiet spell with no new largest
 * contentful paint candidate, the viewer's first touch, wheel or key, or `SETTLE_MAX_WAIT_MS`. Then true for good. Used to keep the Explore feed's debate recordings off
 * the network while the feed's own content — the thing the viewer came for, and the largest
 * contentful paint — is still arriving.
 */
export function usePageSettled(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
