'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

export type QuerySeedEntry = {
  queryKey: readonly unknown[];
  data: unknown;
};

const subscribeNever = () => () => {};

/** False on the server and while the browser hydrates, true for every render after. */
function useIsPastHydration() {
  return React.useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}

function seedMissing(client: QueryClient, entries: QuerySeedEntry[]) {
  for (const { queryKey, data } of entries) {
    if (client.getQueryData(queryKey) === undefined) client.setQueryData(queryKey, data);
  }
}

/**
 * Hands react-query answers the server already fetched, so a client-fetched list is in the server
 * HTML instead of a loading label, and the browser's first render matches it.
 *
 * The app's `queryClient` is one module-level instance, which on the server is shared by every
 * request and never garbage-collected, so seeding it there would pin one reader's rows for
 * everyone after. On the server each render gets a fresh client of its own, holding only these
 * entries. In the browser the shared client is used and is only filled where it has nothing, since
 * what it holds is at least as fresh. Both paths render the same provider so the tree has the same
 * shape on each side of hydration.
 */
export function QuerySeed({ entries, children }: { entries: QuerySeedEntry[]; children: React.ReactNode }) {
  const browserClient = useQueryClient();
  const isPastHydration = useIsPastHydration();
  const [serverClient] = React.useState(() => {
    if (typeof window !== 'undefined') return null;
    const client = new QueryClient({ defaultOptions: browserClient.getDefaultOptions() });
    seedMissing(client, entries);
    return client;
  });
  const seededEntries = React.useRef<QuerySeedEntry[] | null>(null);

  // During hydration, in render, so the browser's first paint has the rows the server drew. After
  // it, a client navigation arrives into a tree already subscribed to the cache, and writing to it
  // mid-render would update other components while this one renders, so that waits for an effect.
  if (!serverClient && !isPastHydration && seededEntries.current !== entries) {
    seededEntries.current = entries;
    seedMissing(browserClient, entries);
  }

  React.useEffect(() => {
    if (serverClient || seededEntries.current === entries) return;
    seededEntries.current = entries;
    seedMissing(browserClient, entries);
  }, [browserClient, entries, serverClient]);

  return <QueryClientProvider client={serverClient ?? browserClient}>{children}</QueryClientProvider>;
}
