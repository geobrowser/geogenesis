'use client';

import * as React from 'react';

import { closeSignInBox, readSignInBox, useSignInBoxRequest } from '~/core/auth/sign-in-box/sign-in-box-store';
import { signInExpectedOnLoad } from '~/core/auth/sign-in-on-load';
import { useTrackedLogin } from '~/core/hooks/use-tracked-login';
import { isPrivyLoaded, usePrivy, usePrivyLoaded } from '~/core/wallet/auth-hooks';
import { scheduleIdleLoad } from '~/core/wallet/auth-root';
import { requestRealAuth } from '~/core/wallet/auth-store';

/** How long after mount an idle page fetches the box, so a first press finds it loaded. */
export const SIGN_IN_BOX_IDLE_DELAY_MS = 2_000;

/**
 * How long a press waits for a box that has not loaded before it gets Privy's dialog instead, if
 * Privy is up by then. The chunk is small and usually preloaded, so a wait this long means a stalled
 * download; past it a press reads as a dead button. With Privy not up either, the press takes
 * whichever of the two arrives first.
 */
export const SIGN_IN_BOX_LOAD_TIMEOUT_MS = 5_000;

type HostModule = typeof import('./sign-in-box');
let hostModule: Promise<HostModule> | null = null;

/** One download shared by every caller; a failed one is retried by the next. */
export function loadSignInBox() {
  if (!hostModule) {
    hostModule = import('./sign-in-box');
    hostModule.catch(() => {
      hostModule = null;
    });
  }
  return hostModule;
}

/**
 * Loads the box at the first press, at once on a page that opens sign-in by itself, or at idle once
 * the reader is known to be signed out. A press whose box cannot load, or has not loaded within
 * `SIGN_IN_BOX_LOAD_TIMEOUT_MS` while Privy has, gets Privy's dialog on the same attempt.
 */
export function SignInBoxGate() {
  const request = useSignInBoxRequest();
  const [Host, setHost] = React.useState<HostModule['SignInBoxHost'] | null>(null);
  const [idle, setIdle] = React.useState(signInExpectedOnLoad);
  const { login } = useTrackedLogin();
  // Ready and signed out: no session was stored, or the restored one turned out invalid. A signed-in
  // reader never needs the box, so it downloads only at a press.
  const { ready, authenticated } = usePrivy();
  const signedOut = ready && !authenticated;
  const privyLoaded = usePrivyLoaded();
  // The attempt whose deadline passed before Privy loaded: it falls back once Privy does.
  const [overdue, setOverdue] = React.useState<string | null>(null);
  const loginRef = React.useRef(login);
  loginRef.current = login;

  // Closes the box's request and opens Privy's dialog on its attempt. Once closed, the request no
  // longer matches, so a second call for the same attempt does nothing.
  const fallBack = React.useCallback((attemptId?: string) => {
    const open = readSignInBox();
    if (!open || (attemptId !== undefined && open.attemptId !== attemptId)) return;
    closeSignInBox(open.attemptId);
    loginRef.current(undefined, undefined, { fallbackFor: open.attemptId, prefillEmail: open.prefillEmail });
  }, []);

  React.useEffect(() => {
    if (idle || !signedOut) return;
    return scheduleIdleLoad(() => setIdle(true), SIGN_IN_BOX_IDLE_DELAY_MS);
  }, [idle, signedOut]);

  const wanted = idle || request !== null;
  React.useEffect(() => {
    if (!wanted || Host) return;
    let cancelled = false;
    loadSignInBox().then(
      // Set even after a timeout's fallback: the request is closed then, so it shows nothing until
      // the next press.
      module => {
        if (!cancelled) setHost(() => module.SignInBoxHost);
      },
      () => {
        if (!cancelled) fallBack();
      }
    );
    return () => {
      cancelled = true;
    };
  }, [wanted, Host, request, fallBack]);

  // Only while a press waits; an idle download has no deadline. Without Privy the fallback has
  // nothing to show, so the request stays open for the box or Privy, whichever comes first.
  const waitingFor = Host ? undefined : request?.attemptId;
  React.useEffect(() => {
    if (waitingFor === undefined) return;
    const timer = setTimeout(() => {
      if (isPrivyLoaded()) {
        fallBack(waitingFor);
        return;
      }
      requestRealAuth();
      setOverdue(waitingFor);
    }, SIGN_IN_BOX_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waitingFor, fallBack]);

  React.useEffect(() => {
    if (overdue !== null && overdue === waitingFor && privyLoaded) fallBack(overdue);
  }, [overdue, waitingFor, privyLoaded, fallBack]);

  return Host ? <Host /> : null;
}

/** Test seam: forget the download. */
export function resetSignInBoxLoad() {
  hostModule = null;
}
