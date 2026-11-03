'use client';

import * as React from 'react';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useLoginWithEmail, usePrivy } from '~/core/wallet/auth-hooks';

import {
  hideRecoveryNotice,
  landedOnModalLink,
  recoveryNotice,
  reloadedCodeStep,
  subscribeRecoveryNotice,
} from './code-step';

/** Shown over Privy's dialog; the copy is the product's to adjust (see PR.md). */
export function recoveryNoticeText(email: string | null) {
  return email
    ? `Continue signing in as ${email}. Tap Submit to get a new code.`
    : 'Continue signing in. Enter your email and tap Submit to get a new code.';
}

/**
 * How long a page that arrived on a `?modal=` link leaves the link to open sign-in, which then picks
 * the code step up itself (with the link's own destination), before opening sign-in for it.
 */
export const LINK_SIGN_IN_GRACE_MS = 3_000;

/**
 * GEO-3573. A page opened with a code step outstanding from an earlier page reopens sign-in with
 * the address filled in, and shows the notice while it waits for a new code.
 *
 * Nothing is sent until the visitor presses Submit: Privy cannot take the old code in a new
 * document, and mailing a new one unasked would leave two codes in their inbox. The claim, prefill
 * and attribution live in `usePrivySignIn`, so a deep link's own sign-in picks the step up too.
 */
export function CodeStepRecovery() {
  const { ready, authenticated, isModalOpen } = usePrivy();
  const { state } = useLoginWithEmail();
  const notice = React.useSyncExternalStore(subscribeRecoveryNotice, recoveryNotice, () => null);
  const openSignIn = usePrivySignIn();
  const openSignInRef = React.useRef(openSignIn);
  openSignInRef.current = openSignIn;
  const sawModal = React.useRef(false);

  React.useEffect(() => {
    if (!ready || authenticated) return;
    const timer = setTimeout(
      () => {
        // Still unclaimed: no link opened sign-in, and no other tab took the step over.
        if (reloadedCodeStep()) openSignInRef.current();
      },
      landedOnModalLink() ? LINK_SIGN_IN_GRACE_MS : 0
    );
    return () => clearTimeout(timer);
  }, [authenticated, ready]);

  // Gone once the dialog closes or the new code is on its way.
  React.useEffect(() => {
    if (!notice) return;
    if (isModalOpen) sawModal.current = true;
    if ((sawModal.current && !isModalOpen) || state.status === 'sending-code' || authenticated) hideRecoveryNotice();
  }, [authenticated, isModalOpen, notice, state.status]);

  if (!notice) return null;
  return (
    <div
      role="status"
      // Above Privy's dialog, which takes the whole viewport on a phone.
      className="pointer-events-none fixed inset-x-0 top-0 z-[2147483647] flex justify-center px-4 pt-[max(12px,env(safe-area-inset-top))]"
    >
      <p className="max-w-[400px] rounded-xl bg-text px-4 py-3 text-[15px] leading-5 text-white shadow-lg">
        {recoveryNoticeText(notice.email)}
      </p>
    </div>
  );
}
