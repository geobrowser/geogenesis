'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import * as React from 'react';

/**
 * One `QueryClient` for the app. The sync engine is handed this same instance
 * (`core/sync/use-sync-engine.tsx`), so these defaults cover its `fetchQuery` calls too.
 *
 * It used to be a bare `new QueryClient()`, which meant every query inherited `staleTime: 0` —
 * data stale the moment it arrived. 73 of the app's 129 `useQuery` call sites set no `staleTime`
 * of their own, so they refetched on every mount and every tab focus. Measured on the entity page:
 * returning to a page you had just left cost 84 requests, and a tab refocus cost 80, all for data
 * already sitting in the cache.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Chosen to sit under the freshness policies the app already has rather than over them.
       *
       * The sync engine re-syncs an entity only after `SYNC_TTL_MS` (5 minutes,
       * `core/sync/engine.ts`), so 30s is an order of magnitude tighter than what that layer
       * already tolerates and cannot leave the store staler than it already permits. The live
       * surfaces don't lean on staleness either: debate activity and participant positions drive
       * themselves with `refetchInterval`, which runs on its own schedule regardless of this, and
       * writes invalidate explicitly — 146 `invalidateQueries` calls across the app, 39 of them in
       * `core/debates` alone.
       *
       * Call sites needing something different already say so: 56 set their own `staleTime`, most
       * commonly `60_000`, and an explicit value always wins over this default.
       */
      staleTime: 30_000,

      /**
       * `refetchOnWindowFocus` is deliberately left at its default of `true`.
       *
       * Disabling it removes more requests — a refocus goes to zero outright rather than zero for
       * 30s — but it also means a tab left open all afternoon never picks up anyone else's votes
       * on return, which is exactly where a stale number gets noticed. With `staleTime` set, rapid
       * alt-tabbing is already free; this keeps the refresh a genuine return deserves.
       */

      /**
       * `core/io/graphql-client.ts` already retries transport failures on an exponential, jittered
       * schedule. React Query's default of 3 sits on top of that and multiplies the budget, so a
       * failing query took far longer to surface than it looked. One outer attempt keeps a safety
       * net for anything the client's own retry doesn't cover, without tripling it.
       */
      retry: 1,
    },
  },
});

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
