'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { browseSidebarDataQueryKey } from '~/core/browse/browse-sidebar-query';
import { useBrowseSidebarQuerySource } from '~/core/browse/use-browse-sidebar-cache';

/**
 * Start the claim-space allowlist's traversal before the rematch picker needs it (GEO-2599).
 *
 * The picker does not *repeat* the browse sidebar's work — it shares its cache. It mounts alongside
 * it and then waits: the All tab gates on `allowlistPending`, and assembling the allowlist walks the
 * Root space's topic tree, up to about thirteen sequential round trips on a cold cache. The tab is
 * empty for as long as that takes, which is what "took like 1 min to load" was.
 *
 * Warming it during the debate turns that into time nobody was waiting on, because a debate runs for
 * minutes before its thank-you screen offers another one. Same key, same fetchers and the same
 * `staleTime` as {@link useClaimSpaceAllowlist}, so on a page that already renders the sidebar this
 * is a no-op rather than a second request.
 *
 * Called from the debate room rather than from `DebateCoordinator`, which was the obvious home and
 * the wrong one: the coordinator is mounted on *every page in the app*, and reading the sidebar's
 * query source there pulls a smart-account resolver — and with it a `CookiesProvider` requirement —
 * into the graph of every page, for a warm-up most viewers never trigger. The room is already inside
 * those providers, and being in a debate is the signal that matters anyway.
 *
 * The fetchers are still imported dynamically so the sidebar's loaders stay off the path until a
 * warm-up actually runs.
 *
 * Gated on the same `personalSpaceLoading` as the hook, for the same reason: fetching earlier would
 * cache a featured-only, signed-out answer under a partial identity key and drop the viewer's own
 * spaces out of their own panel for as long as that entry stayed fresh. Warming the wrong answer
 * sooner is worse than warming the right one late.
 */
export function usePrefetchClaimSpaceAllowlist(enabled: boolean) {
  const queryClient = useQueryClient();
  const { personalSpaceId, walletAddress, keyInput, isLoading: personalSpaceLoading } = useBrowseSidebarQuerySource();

  React.useEffect(() => {
    if (!enabled || personalSpaceLoading) return;
    void queryClient.prefetchQuery({
      queryKey: browseSidebarDataQueryKey(keyInput),
      queryFn: async () => {
        if (personalSpaceId) {
          const { fetchBrowseSidebarData } = await import('~/core/browse/fetch-browse-sidebar-data');
          return fetchBrowseSidebarData(personalSpaceId);
        }
        const { loadBrowseSidebarData } = await import('~/partials/browse-sidebar/load-browse-sidebar-data');
        return loadBrowseSidebarData(walletAddress);
      },
      staleTime: 60_000,
    });
  }, [enabled, keyInput, personalSpaceId, personalSpaceLoading, queryClient, walletAddress]);
}
