'use client';

import * as React from 'react';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { readStoredFeatureFlag } from '~/core/state/feature-flags';
import { useLoginWithEmail, usePrivy } from '~/core/wallet/auth-hooks';

import {
  claimCodeRecovery,
  codeRecoveryWaiting,
  hideRecoveryNotice,
  landedOnModalLink,
  recoveryNotice,
  subscribeRecoveryNotice,
} from './code-step';
import { useSignInDialogOpen } from './sign-in-box/use-sign-in-dialog-open';

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
 * GEO-3573. Reopens sign-in, prefilled, for a code step the same tab left before a reload, and shows the
 * notice. A new tab only recovers through a link's own sign-in. Sends nothing itself; the prefill lives
 * in `usePrivySignIn`, so a deep link's sign-in uses it too.
 */
export function CodeStepRecovery() {
  const { ready, authenticated } = usePrivy();
  const dialogOpen = useSignInDialogOpen();
  const { state } = useLoginWithEmail();
  const notice = React.useSyncExternalStore(subscribeRecoveryNotice, recoveryNotice, () => null);
  const openSignIn = usePrivySignIn();
  const openSignInRef = React.useRef(openSignIn);
  openSignInRef.current = openSignIn;
  const sawModal = React.useRef(false);

  React.useEffect(() => {
    if (!ready || authenticated) return;
    let cancelled = false;
    const timer = setTimeout(
      () =>
        void claimCodeRecovery().then(() => {
          // Claimed here, the same tab, and no sign-in has opened since (a link's would have used it).
          if (!cancelled && readStoredFeatureFlag('signInRecoveryAutoOpen') && codeRecoveryWaiting()) {
            openSignInRef.current();
          }
        }),
      landedOnModalLink() ? LINK_SIGN_IN_GRACE_MS : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authenticated, ready]);

  // Gone once the dialog closes or the new code is on its way.
  React.useEffect(() => {
    if (!notice) return;
    if (dialogOpen) sawModal.current = true;
    if ((sawModal.current && !dialogOpen) || state.status === 'sending-code' || authenticated) hideRecoveryNotice();
  }, [authenticated, dialogOpen, notice, state.status]);

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
