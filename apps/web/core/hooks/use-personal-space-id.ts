'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getSpaceByAddress } from '~/core/io/queries';

import { useSmartAccount } from './use-smart-account';

/**
 * How often to re-check for a personal space that doesn't exist yet. Space creation
 * resolves in ~30s–3min, so this keeps the wait feeling live without hammering the API.
 */
const UNREGISTERED_POLL_INTERVAL_MS = 3_000;

/** Hook to get the user's personal space ID from the GraphQL API. */
export function usePersonalSpaceId() {
  const { smartAccount, isLoading: isLoadingSmartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;

  const { data, isLoading, isFetched } = useQuery({
    queryKey: ['personal-space-id', address],
    queryFn: async () => {
      if (!address) return null;

      const space = await Effect.runPromise(getSpaceByAddress(address));

      if (!space) {
        return { isRegistered: false, personalSpaceId: null };
      }

      return { isRegistered: true, personalSpaceId: space.id };
    },
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    // Poll until a space shows up, then stop for good.
    //
    // Registration lands on-chain long before the indexer serves it, and the answer
    // arrives with no client-side event to hang an invalidation on. Without this the
    // cached "not registered" stuck for the full 5-minute staleTime: the space existed
    // within seconds, but the app kept the user unregistered — no personal-space chip,
    // and every write refused with "You need a registered personal space". Client
    // navigation didn't help (the cache is global and still fresh); only a hard reload
    // did. The background runner seeds this cache on its happy path, but that path is
    // exactly the one that doesn't always fire.
    //
    // Registered is terminal — a space is never un-created — so returning false here
    // ends the polling permanently rather than just skipping a tick.
    refetchInterval: query => (query.state.data?.isRegistered ? false : UNREGISTERED_POLL_INTERVAL_MS),
    // Don't burn requests for a tab nobody is looking at; it resumes on focus.
    refetchIntervalInBackground: false,
  });

  return {
    personalSpaceId: data?.personalSpaceId ?? null,
    isRegistered: data?.isRegistered ?? false,
    // TanStack's isLoading can read false for a tick after the query becomes enabled but
    // before it dispatches a fetch — same gap a disabled query has pre-address. isFetched
    // doesn't lag: it stays false until a fetch for this queryKey actually completes.
    isLoading: isLoadingSmartAccount || (!!address && !isFetched) || isLoading,
    isFetched,
  };
}
