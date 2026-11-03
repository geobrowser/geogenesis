'use client';

import * as React from 'react';

import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useLoginWithEmail, usePrivy } from '~/core/wallet/auth-hooks';

import { type PendingCode, claimReloadedCodeStep, clearCodeStep, codeRecoveryOffered } from './code-step';

/** Shown over Privy's dialog; its copy is the product's to adjust (see PR.md). */
export const RECOVERY_NOTICE = {
  title: 'Your page reloaded',
  body: (email: string | null) =>
    email
      ? `The code we sent you only works in the window that asked for it. Press Submit to get a new code sent to ${email}.`
      : 'The code we sent you only works in the window that asked for it. Enter your email to get a new code.',
};

/**
 * GEO-3573. A tab reloaded at the code step reopens sign-in with the address filled in.
 *
 * Nothing is sent until the visitor presses Submit: Privy cannot take the old code in a new
 * document, and mailing a new one unasked would leave two codes in their inbox.
 */
export function CodeStepRecovery() {
  const { ready, authenticated, isModalOpen } = usePrivy();
  const { state } = useLoginWithEmail();
  const [pending, setPending] = React.useState<PendingCode | null>(null);
  const [noticeShown, setNoticeShown] = React.useState(false);
  const opened = React.useRef(false);
  const sawModal = React.useRef(false);

  // In an effect, not render: claiming reports the return, once.
  React.useEffect(() => setPending(claimReloadedCodeStep()), []);

  const openSignIn = usePrivySignIn(undefined, {
    analytics: () => ({
      ...pending?.properties,
      auth_recovery: 'reloaded_code_step',
      recovered_attempt_id: pending?.attemptId,
    }),
  });

  React.useEffect(() => {
    if (!pending || !ready || opened.current) return;
    opened.current = true;
    if (authenticated) {
      clearCodeStep();
      return;
    }
    const attempt = openSignIn(undefined, { prefillEmail: pending.email ?? undefined });
    codeRecoveryOffered(pending, attempt?.id);
    setNoticeShown(true);
  }, [authenticated, openSignIn, pending, ready]);

  // Gone once the dialog closes or the new code is on its way.
  React.useEffect(() => {
    if (!noticeShown) return;
    if (isModalOpen) sawModal.current = true;
    if ((sawModal.current && !isModalOpen) || state.status === 'sending-code' || authenticated) setNoticeShown(false);
  }, [authenticated, isModalOpen, noticeShown, state.status]);

  if (!noticeShown || !pending) return null;
  return (
    <div
      role="status"
      // Above Privy's dialog, which takes the whole viewport on a phone.
      className="pointer-events-none fixed inset-x-0 top-0 z-[2147483647] flex justify-center px-4 pt-[max(12px,env(safe-area-inset-top))]"
    >
      <div className="max-w-[400px] rounded-xl bg-text px-4 py-3 text-white shadow-lg">
        <p className="text-[15px] leading-5 font-semibold">{RECOVERY_NOTICE.title}</p>
        <p className="mt-1 text-[14px] leading-5 text-white/80">{RECOVERY_NOTICE.body(pending.email)}</p>
      </div>
    </div>
  );
}
