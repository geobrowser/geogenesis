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
  monotonicNow: () => number = () => performance.now()
): Promise<ServerClock> {
  const results = await Promise.allSettled(
    Array.from({ length: 3 }, async (): Promise<ServerTimeSample> => {
      const startedAt = monotonicNow();
      const response = await fetchServerTime();
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
