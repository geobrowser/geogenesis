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

/**
 * How long after this browser sends a profile publish we keep trusting it over an index
 * that still shows no profile. The indexer runs seconds to a minute behind the chain;
 * without this, a reload in that window would read "registered, no profile" and reopen
 * onboarding for an account whose profile is already on its way.
 */
const PROFILE_PUBLISH_GRACE_MS = 10 * 60 * 1000;

function profilePublishStorageKey(address: string) {
  return `personalProfilePublishedAt:${address.toLowerCase()}`;
}

/** Record that this browser just sent the personal profile publish for `address`. */
export function markPersonalProfilePublished(address: string) {
  try {
    window.localStorage.setItem(profilePublishStorageKey(address), String(Date.now()));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the grace is a nicety.
  }
}

function recentlyPublishedProfile(address: string) {
  try {
    const at = Number(window.localStorage.getItem(profilePublishStorageKey(address)));
    return Number.isFinite(at) && Date.now() - at < PROFILE_PUBLISH_GRACE_MS;
  } catch {
    return false;
  }
}

export type PersonalSpaceIdData = {
  isRegistered: boolean;
  personalSpaceId: string | null;
  personalEntityId: string | null;
  /**
   * Registered on-chain, but the profile publish never landed: no topic, no page, no
   * name. Re-running onboarding fixes it — `createPersonalSpaceOnChain` skips the
   * registration it already has and only publishes the profile. Optional so cache seeds
   * that predate it read as "has a profile".
   */
  needsProfile?: boolean;
};

export function personalSpaceIdQueryKey(address: string | null | undefined) {
  return ['personal-space-id', address] as const;
}

/** Hook to get the user's personal space ID from the GraphQL API. */
export function usePersonalSpaceId() {
  const { smartAccount, isLoading: isLoadingSmartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;

  const { data, isLoading, isFetched } = useQuery({
    queryKey: personalSpaceIdQueryKey(address),
    queryFn: async (): Promise<PersonalSpaceIdData | null> => {
      if (!address) return null;

      const space = await Effect.runPromise(getSpaceByAddress(address));

      if (!space) {
        return { isRegistered: false, personalSpaceId: null, personalEntityId: null };
      }

      return {
        isRegistered: true,
        personalSpaceId: space.id,
        personalEntityId: space.topicId ?? null,
        needsProfile: space.type === 'PERSONAL' && !space.hasProfile && !recentlyPublishedProfile(address),
      };
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
    personalEntityId: data?.personalEntityId ?? null,
    isRegistered: data?.isRegistered ?? false,
    needsProfile: data?.needsProfile ?? false,
    // TanStack's isLoading can read false for a tick after the query becomes enabled but
    // before it dispatches a fetch — same gap a disabled query has pre-address. isFetched
    // doesn't lag: it stays false until a fetch for this queryKey actually completes.
    isLoading: isLoadingSmartAccount || (!!address && !isFetched) || isLoading,
    isFetched,
  };
}
