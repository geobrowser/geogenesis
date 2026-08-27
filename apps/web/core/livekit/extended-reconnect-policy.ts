import type { ReconnectContext, ReconnectPolicy } from 'livekit-client';

/** Maximum time to keep retrying before giving up (3 minutes). */
const DEFAULT_MAX_RETRY_DURATION_MS = 180_000;

/** Maximum base delay between individual retry attempts (jitter may add up to 1s on top). */
const MAX_RETRY_DELAY_MS = 5_000;

/**
 * Extended reconnect policy that retries with exponential backoff for up to 3 minutes by default
 * (tunable per surface via the constructor). The default LiveKit policy gives up after ~45
 * seconds, which is too short for transient server issues (e.g. deploys) or brief network drops.
 */
export class ExtendedReconnectPolicy implements ReconnectPolicy {
  constructor(private readonly maxRetryDurationMs: number = DEFAULT_MAX_RETRY_DURATION_MS) {}

  nextRetryDelayInMs(context: ReconnectContext): number | null {
    if (context.elapsedMs >= this.maxRetryDurationMs) {
      return null;
    }
    const delay = Math.min(300 * 2 ** context.retryCount, MAX_RETRY_DELAY_MS);
    // Add jitter after the first two attempts to avoid thundering herd
    if (context.retryCount > 1) {
      return delay + Math.random() * 1000;
    }
    return delay;
  }
}
