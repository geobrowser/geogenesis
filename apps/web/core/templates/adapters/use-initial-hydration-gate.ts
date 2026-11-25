'use client';

import * as React from 'react';

/**
 * Coalesces multiple async client queries on live entity templates into a single smooth reveal
 * so above-the-fold sections (`Claims`, `Supporting claims`, `Debates`, `Sources`) do not pop
 * in sequentially and shove content downward.
 *
 * - Returns `true` on SSR and initial client hydration so server and client markup match cleanly.
 * - Releases to `false` as soon as `isBusy` settles after mount, OR after `maxWaitMs` so a slow
 *   upstream query can never block the page.
 * - Once released for a given `resetKey`, stays `false` during subsequent votes or background refetches.
 */
export function useInitialHydrationGate(isBusy: boolean, resetKey: string, maxWaitMs = 950): boolean {
  const [releasedKey, setReleasedKey] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);

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

  if (releasedKey === resetKey) return false;
  return !mounted || isBusy;
}
