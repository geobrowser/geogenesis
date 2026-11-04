'use client';

import * as React from 'react';

import { closeSignInBox, readSignInBox, useSignInBoxRequest } from '~/core/auth/sign-in-box/sign-in-box-store';
import { signInExpectedOnLoad } from '~/core/auth/sign-in-on-load';
import { useTrackedLogin } from '~/core/hooks/use-tracked-login';
import { scheduleIdleLoad } from '~/core/wallet/auth-root';

/** How long after mount an idle page fetches the box, so a first press finds it loaded. */
export const SIGN_IN_BOX_IDLE_DELAY_MS = 2_000;

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
 * Loads the box at idle, at the first press, or at once on a page that opens sign-in by itself. A
 * press whose box cannot load gets Privy's dialog on the same attempt.
 */
export function SignInBoxGate() {
  const request = useSignInBoxRequest();
  const [Host, setHost] = React.useState<HostModule['SignInBoxHost'] | null>(null);
  const [idle, setIdle] = React.useState(signInExpectedOnLoad);
  const { login } = useTrackedLogin();
  const loginRef = React.useRef(login);
  loginRef.current = login;

  React.useEffect(() => {
    if (idle) return;
    return scheduleIdleLoad(() => setIdle(true), SIGN_IN_BOX_IDLE_DELAY_MS);
  }, [idle]);

  const wanted = idle || request !== null;
  React.useEffect(() => {
    if (!wanted || Host) return;
    let cancelled = false;
    loadSignInBox().then(
      module => {
        if (!cancelled) setHost(() => module.SignInBoxHost);
      },
      () => {
        const open = readSignInBox();
        if (cancelled || !open) return;
        closeSignInBox(open.attemptId);
        loginRef.current(undefined, undefined, { fallbackFor: open.attemptId, prefillEmail: open.prefillEmail });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [wanted, Host, request]);

  return Host ? <Host /> : null;
}

/** Test seam: forget the download. */
export function resetSignInBoxLoad() {
  hostModule = null;
}
