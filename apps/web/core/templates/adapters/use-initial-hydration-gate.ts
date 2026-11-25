'use client';

import * as React from 'react';

/**
 * Coalesces multiple async client queries on live entity templates into a single smooth reveal
 * so above-the-fold sections (`Claims`, `Supporting claims`, `Debates`, `Sources`) do not pop
 * in sequentially and shove content downward.
 *
 * - By default returns `true` on SSR and initial client hydration so server and client markup match.
 * - With `revealSettledBeforeMount`, a render that is already settled (`isBusy` false) releases at
 *   once, on the server and in the first client render too, so data the server handed over (the
 *   Topic page's prefetch) is drawn in the HTML instead of behind a skeleton until mount. Only for
 *   callers whose `isBusy` reads nothing but what the server hands the client (seeded React Query
 *   entries, the page's own entity): both sides then agree on it and the markup still matches.
 * - Releases to `false` as soon as `isBusy` settles after mount, OR after `maxWaitMs` so a slow
 *   upstream query can never block the page.
 * - Once released for a given `resetKey`, stays `false` during subsequent votes or background refetches.
 */
export function useInitialHydrationGate(
  isBusy: boolean,
  resetKey: string,
  maxWaitMs = 950,
  { revealSettledBeforeMount = false }: { revealSettledBeforeMount?: boolean } = {}
): boolean {
  const [releasedKey, setReleasedKey] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);

  // Latched during render, so the server (where effects never run) draws the sections too. React
  // re-renders this component at once with the new state, before anything is committed.
  const releasesNow = revealSettledBeforeMount && !isBusy && releasedKey !== resetKey;
  if (releasesNow) setReleasedKey(resetKey);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    if (!isBusy) {
      setReleasedKey(resetKey);
      return;
    }
    const timer = window.setTimeout(() => {
      setReleasedKey(resetKey);
    }, maxWaitMs);
    return () => window.clearTimeout(timer);
  }, [isBusy, maxWaitMs, mounted, resetKey]);

  if (releasesNow || releasedKey === resetKey) return false;
  return !mounted || isBusy;
}
