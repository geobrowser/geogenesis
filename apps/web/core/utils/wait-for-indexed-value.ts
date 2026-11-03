import { sleep } from './utils';

/** Bounded indexer reconciliation shared by response and membership writes. */
export async function waitForIndexedValue<T>(
  fetchResponse: (signal: AbortSignal) => Promise<T>,
  expectedResponse: T,
  maxAttempts = 30,
  intervalMs = 2_000,
  probeTimeoutMs = 5_000,
  signal?: AbortSignal
): Promise<boolean> {
  const deadline = Date.now() + Math.max(probeTimeoutMs, maxAttempts * intervalMs);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) return false;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return false;
    const controller = new AbortController();
    let rejectTimeout: ((reason: Error) => void) | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
    });
    const abortProbe = () => {
      controller.abort();
      rejectTimeout?.(new Error('Indexing reconciliation was superseded'));
    };
    signal?.addEventListener('abort', abortProbe, { once: true });
    const timeoutId = setTimeout(
      () => {
        controller.abort();
        rejectTimeout?.(new Error('Timed out waiting for indexing'));
      },
      Math.min(probeTimeoutMs, remainingMs)
    );

    try {
      if ((await Promise.race([fetchResponse(controller.signal), timeoutPromise])) === expectedResponse) {
        return true;
      }
    } catch {
      // Gaia can fail transiently while indexing. Keep the transaction in its
      // processing state and retry instead of presenting a false write error.
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortProbe);
    }

    if (attempt < maxAttempts) {
      if (signal?.aborted) return false;
      await sleep(intervalMs);
    }
  }

  return false;
}
