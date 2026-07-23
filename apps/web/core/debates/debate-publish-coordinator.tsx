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
        // 409 = media not processed yet; keep it queued and retry next tick. Everything else is
        // terminal for this debate: 2xx published/already-published, 503 acceptor disabled, or a 5xx
        // we don't want to hammer — drop it so a real error doesn't loop forever.
        if (response.status !== 409) {
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
