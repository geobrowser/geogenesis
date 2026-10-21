export type ServerClock = {
  now: () => number;
  roundTripMs: number | null;
};

export type ServerTimeSample = {
  serverTimeMs: number;
  startedAt: number;
  endedAt: number;
};

type FetchServerTime = () => Promise<{ server_time_ms: number }>;

const defaultRequestTimeoutMs = 2_000;

/**
 * When the debate room tries again after a clock sync fails, after each failure in turn (GEO-3407).
 * Until one succeeds the room runs on the computer's own clock, which can be whole seconds off the
 * other debater's — enough that one sees a turn end while the other is still hearing it.
 */
export const SERVER_CLOCK_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

export function createLocalServerClock(): ServerClock {
  return {
    now: () => Date.now(),
    roundTripMs: null,
  };
}

export function selectBestServerTimeSample(
  samples: ServerTimeSample[],
  monotonicNow: () => number = () => performance.now()
): ServerClock {
  const best = samples.reduce<ServerTimeSample | null>((selected, sample) => {
    if (!selected) return sample;
    return roundTripMs(sample) < roundTripMs(selected) ? sample : selected;
  }, null);
  if (!best) throw new Error('Could not synchronize the debate clock.');

  const bestRoundTripMs = roundTripMs(best);
  const serverTimeAtReceipt = best.serverTimeMs + bestRoundTripMs / 2;
  const receiptMonotonicTime = best.endedAt;

  return {
    now: () => serverTimeAtReceipt + (monotonicNow() - receiptMonotonicTime),
    roundTripMs: bestRoundTripMs,
  };
}

export async function synchronizeServerClock(
  fetchServerTime: FetchServerTime,
  monotonicNow: () => number = () => performance.now(),
  requestTimeoutMs = defaultRequestTimeoutMs
): Promise<ServerClock> {
  const results = await Promise.allSettled(
    Array.from({ length: 3 }, async (): Promise<ServerTimeSample> => {
      const startedAt = monotonicNow();
      const response = await withTimeout(fetchServerTime(), requestTimeoutMs);
      const endedAt = monotonicNow();
      return {
        serverTimeMs: response.server_time_ms,
        startedAt,
        endedAt,
      };
    })
  );
  const samples = results.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []));

  return selectBestServerTimeSample(samples, monotonicNow);
}

function roundTripMs(sample: ServerTimeSample) {
  return Math.max(0, sample.endedAt - sample.startedAt);
}

// Bare timer globals, not `window.*`: they resolve in browser, node, and — the
// case that bites — a test whose in-flight sync settles after the jsdom
// environment (and `window` with it) is torn down. A late rejection then stays
// an ordinary rejection instead of throwing "window is not defined" from the
// cleanup handler and failing the run as an unhandled error.
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server time request timed out.')), timeoutMs);
    void promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
