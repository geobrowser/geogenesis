'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { waitForQueuedSends } from '~/core/hooks/smart-account-send-queue';
import { useToast } from '~/core/hooks/use-toast';

import { SmallButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';

/**
 * Responses that never submitted (QueuedSendTimeoutError), keyed per entity response.
 * Module scope: one burst fails many buttons, some unmounted, sharing one toast.
 */
type FailedResponse = {
  /** Re-submits the same vote. Resolves without submitting when its target or account changed. */
  retry: () => Promise<unknown>;
};

const failedResponses = new Map<string, FailedResponse>();
const listeners = new Set<() => void>();
let snapshot = { count: 0, retrying: false };

function notify() {
  snapshot = { count: failedResponses.size, retrying: snapshot.retrying };
  for (const listener of listeners) listener();
}

function setRetrying(retrying: boolean) {
  snapshot = { ...snapshot, retrying };
  notify();
}

export function recordFailedResponse(key: string, entry: FailedResponse) {
  // Re-inserting moves the entry to the end, so Retry replays in failure order.
  failedResponses.delete(key);
  failedResponses.set(key, entry);
  notify();
}

export function clearFailedResponse(key: string) {
  if (failedResponses.delete(key)) notify();
}

export function clearAllFailedResponses() {
  failedResponses.clear();
  notify();
}

/**
 * One at a time, each after queued sends settle, so each gets the full queue budget.
 * Stops at the first that times out again; the rest wait for the next Retry.
 */
export async function retryFailedResponses() {
  if (snapshot.retrying) return;
  setRetrying(true);
  try {
    for (const key of [...failedResponses.keys()]) {
      const entry = failedResponses.get(key);
      // Cleared by a newer vote on the same entity since the retry started.
      if (!entry) continue;
      await waitForQueuedSends();
      // Dismissed, or superseded by a newer vote, while waiting.
      if (failedResponses.get(key) !== entry) continue;
      try {
        await entry.retry();
      } catch {
        // The mutation's onError records an `unavailable` failure again; anything else
        // may have landed and is not retried.
      }
      const after = failedResponses.get(key);
      // Same entry: the retry was skipped (account changed), so drop it.
      if (after === entry) clearFailedResponse(key);
      // A new entry: it timed out again.
      else if (after) break;
    }
  } finally {
    setRetrying(false);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFailedResponses() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot
  );
}

/** Test-only. */
export function resetFailedResponses() {
  failedResponses.clear();
  snapshot = { count: 0, retrying: false };
  notify();
}

export function FailedResponsesToast() {
  const [, setToast] = useToast();
  const { count, retrying } = useFailedResponses();

  useEffect(() => {
    if (count === 0 && !retrying) setToast(null);
  }, [count, retrying, setToast]);

  if (count === 0) {
    // The last entry clears itself as its retry starts.
    return retrying ? <p className="text-button">Retrying…</p> : null;
  }

  return (
    <div className="flex items-center gap-3">
      <button
        aria-label="Dismiss"
        onClick={() => {
          clearAllFailedResponses();
          setToast(null);
        }}
      >
        <Close />
      </button>
      <p className="text-button">
        {count === 1 ? "Your vote didn't go through." : `${count} votes didn't go through.`}
      </p>
      {retrying ? (
        <p className="text-button">Retrying…</p>
      ) : (
        <SmallButton variant="tertiary" onClick={() => void retryFailedResponses()}>
          Retry
        </SmallButton>
      )}
    </div>
  );
}
