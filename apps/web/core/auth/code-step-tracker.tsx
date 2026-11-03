'use client';

import * as React from 'react';

import { currentAuthAttempt, readAuthAttempt, subscribeAuthAttempts } from '~/core/auth-attempt';
import { useOnSignOut } from '~/core/hooks/use-on-sign-out';
import { useLoginWithEmail, usePrivy } from '~/core/wallet/auth-hooks';

import {
  clearCodeStep,
  codeScreenShown,
  codeStepAttemptEnded,
  codeStepHidden,
  codeStepVisible,
  readPendingCode,
} from './code-step';

/** Privy's dialog names its address field this; nothing of ours does. */
function readPrivyEmailField(): string | null {
  if (typeof document === 'undefined') return null;
  const field = document.getElementById('email-input');
  return field instanceof HTMLInputElement ? field.value : null;
}

/** Feeds `code-step`. Privy's dialog and the headless code step share one email flow state, so this covers every entry. */
export function CodeStepTracker() {
  const { state } = useLoginWithEmail();
  const { ready, authenticated } = usePrivy();
  const status = state.status;
  const previous = React.useRef(status);
  // Privy's dialog leaves the address screen once the code is on its way, so the field is read
  // while it is still on screen.
  const fieldEmail = React.useRef<string | null>(null);

  React.useEffect(() => {
    const before = previous.current;
    previous.current = status;
    if (status === 'sending-code') fieldEmail.current = readPrivyEmailField();
    // Only a send reaches the code screen: a retry after a wrong code goes error -> submitting.
    if (status === 'awaiting-code-input' && before === 'sending-code') {
      codeScreenShown(fieldEmail.current);
      fieldEmail.current = null;
    }
  }, [status]);

  React.useEffect(() => {
    const onVisibility = () => (document.visibilityState === 'hidden' ? codeStepHidden() : codeStepVisible());
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  React.useEffect(() => {
    const unsubscribe = subscribeAuthAttempts(() => {
      const pending = readPendingCode();
      if (!pending) return;
      const own = [pending.attemptId, pending.recoveryAttemptId].map(id => (id ? readAuthAttempt(id) : undefined));
      // The code's own attempts first, then whatever this document just ended (a close of any sign-in).
      for (const attempt of [...own, currentAuthAttempt()]) {
        if (attempt?.outcome) return codeStepAttemptEnded(attempt);
      }
    });
    return () => void unsubscribe();
  }, []);

  // Signed in by any route, or signed out: nothing is left to pick up, and a shared device must not
  // offer the last person's address.
  React.useEffect(() => {
    if (ready && authenticated && readPendingCode()) clearCodeStep();
  }, [authenticated, ready]);
  useOnSignOut(clearCodeStep);

  return null;
}
