'use client';

import * as React from 'react';

import { dequeueDebatePublish, listPendingDebatePublishes, observeDebatePublishQueue } from './publish-queue';

const POLL_INTERVAL_MS = 30_000;

/**
 * Drains the debate auto-publish queue: for each debate awaiting publish, POST to the acceptor
 * publish route. The route publishes only once media processing is done (else 409), so we keep
 * a debate queued and retry on the interval until it lands. Runs app-wide with no UI.
 */
export function DebatePublishCoordinator() {
  const [pending, setPending] = React.useState<string[]>([]);
  const inFlightRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    setPending(listPendingDebatePublishes());
    return observeDebatePublishQueue(setPending);
  }, []);

  const drain = React.useCallback(async () => {
    for (const debateId of listPendingDebatePublishes()) {
      if (inFlightRef.current.has(debateId)) continue;
      inFlightRef.current.add(debateId);
      try {
        const response = await fetch(`/api/debates/${debateId}/publish`, { method: 'POST' });
        // Keep it queued to retry on 409 (media still processing) and transient 5xx (RPC/IPFS/
        // bundler blips). 503 is the acceptor being unconfigured — terminal, retrying never helps.
        // Everything else (2xx published/already-published/not-editor, other 4xx) is terminal too.
        const retryable = response.status === 409 || (response.status >= 500 && response.status !== 503);
        if (!retryable) {
          dequeueDebatePublish(debateId);
        }
      } catch (error) {
        console.warn(`[DebatePublishCoordinator] publish request failed for ${debateId}:`, error);
      } finally {
        inFlightRef.current.delete(debateId);
      }
    }
  }, []);

  React.useEffect(() => {
    if (pending.length === 0) return;
    void drain();
    const timer = window.setInterval(() => void drain(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [drain, pending]);

  return null;
}
