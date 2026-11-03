'use client';

import * as React from 'react';

import { readAuthAttempt, subscribeAuthAttempts } from '~/core/auth-attempt';
import { useLoginWithEmail } from '~/core/wallet/auth-hooks';

import { codeScreenShown, codeStepAttemptEnded, codeStepHidden, codeStepVisible, readPendingCode } from './code-step';

/** Privy's dialog names its address field this; nothing of ours does. */
function readPrivyEmailField(): string | null {
  if (typeof document === 'undefined') return null;
  const field = document.getElementById('email-input');
  return field instanceof HTMLInputElement ? field.value : null;
}

/**
 * Feeds `code-step` from every email sign-in at once. Privy's dialog and the headless code step
 * (save-votes, Explore email capture) share one email flow state, which `useLoginWithEmail` reads
 * without starting anything, so one observer covers every entry.
 */
export function CodeStepTracker() {
  const { state } = useLoginWithEmail();
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
      for (const id of [pending.attemptId, pending.recoveryAttemptId]) {
        const attempt = id ? readAuthAttempt(id) : undefined;
        if (attempt?.outcome) return codeStepAttemptEnded(attempt);
      }
    });
    return () => void unsubscribe();
  }, []);

  return null;
}
