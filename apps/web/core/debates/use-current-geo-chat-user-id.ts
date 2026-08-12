'use client';

import * as React from 'react';

import { getCurrentGeoChatUserId, resolveCurrentGeoChatUserId } from './api';
import { useGeoChatAuth } from './hooks';

/**
 * The viewer's geo-chat user id, for the decisions that need to know *who* the viewer is.
 *
 * {@link getCurrentGeoChatUserId} reads the stored session synchronously and returns null until
 * that session has been written — and being a plain read, nothing re-renders when it lands. That
 * null is fine for code that only styles itself differently, but it is not fine for code that
 * decides whether to show someone their own request: an absent id reads as "not you", so the
 * person the request is *for* gets treated like a bystander and shown nothing.
 *
 * So: prefer the stored session on every render, and when it isn't there yet, run the token
 * exchange once and hold the answer until it is.
 */
export function useCurrentGeoChatUserId(): string | null {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const stored = getCurrentGeoChatUserId();
  // Kept with the account it was resolved for. Switching accounts clears the stored session, so a
  // bare id would go on answering for the account the viewer just left.
  const [resolved, setResolved] = React.useState<{ accountKey: string | null; id: string } | null>(null);

  React.useEffect(() => {
    // The stored session already answers it, and it stays authoritative — a resolved id from an
    // earlier account must never outlive it.
    if (stored) {
      setResolved(current => (current === null ? current : null));
      return;
    }
    if (!authenticated) {
      setResolved(null);
      return;
    }

    let cancelled = false;
    void resolveCurrentGeoChatUserId(getPrivyIdentityToken, accountKey)
      .then(id => {
        if (!cancelled && id) setResolved({ accountKey, id });
      })
      // Nothing to recover here: the session write that follows any authenticated request puts the
      // id back within reach of the synchronous read above.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accountKey, authenticated, getPrivyIdentityToken, stored]);

  if (stored) return stored;
  return resolved && resolved.accountKey === accountKey ? resolved.id : null;
}
