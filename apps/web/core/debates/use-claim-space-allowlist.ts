'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useAtomValue } from 'jotai';

import { browseSidebarDataQueryKey } from '~/core/browse/browse-sidebar-query';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { useBrowseSidebarQuerySource } from '~/core/browse/use-browse-sidebar-cache';
import { requestedMembershipSpacesAtom } from '~/core/state/requested-membership';

import { loadBrowseSidebarData } from '~/partials/browse-sidebar/load-browse-sidebar-data';

import {
  awaitsRequestedMembership,
  browseSidebarClaimSpaceAllowlist,
  browseSidebarMemberSpaceIds,
} from './claim-space-allowlist';

/**
 * How often to re-ask while a request the viewer just made is missing from the answer. Indexing
 * lands in tens of seconds, and the poll can only run while an unexpired bridge entry says there
 * is something to wait for.
 */
const REQUESTED_MEMBERSHIP_POLL_MS = 10_000;

/**
 * The spaces the viewer may see claims from — featured spaces, plus the spaces they are a member
 * or an editor of. See {@link browseSidebarClaimSpaceAllowlist} for how the set is assembled.
 *
 * Keyed and fetched exactly like `BrowseSidebar`'s own query, down to the wallet-address fallback
 * key, so on any page that renders the sidebar (every page under `app/entry.tsx`) this reads the
 * sidebar's cache rather than repeating its featured-topic traversal.
 *
 * The fallback is not just a cache-sharing nicety. `usePersonalSpaceId` resolves a space from the
 * wallet address alone, where the sidebar's resolver prefers the wallet's *profile* space and only
 * falls back to that lookup — so a viewer whose profile carries a space id the address lookup
 * misses reads as having no personal space here. Keying on the address and going through the same
 * resolver is what keeps their own member and editor spaces in the allowlist.
 *
 * `allowlist` is null until the sources settle, which callers must read as "don't filter yet"
 * rather than "nothing is allowed". `memberSpaceIds` — the narrower set the viewer actually
 * belongs to, which the space filter defaults to (GEO-2789) — is null on the same terms, and comes
 * off this query rather than its own: it is the same sidebar payload, read two ways.
 */
export function useClaimSpaceAllowlist(enabled: boolean = true): {
  allowlist: Set<string> | null;
  memberSpaceIds: Set<string> | null;
  isLoading: boolean;
  /**
   * Whether a request the viewer has made is still missing from `memberSpaceIds`.
   *
   * The answer arrives in pieces — sign-up sends one proposal per picked space and they land
   * seconds apart — so a caller that treats the first non-empty answer as the final one acts on a
   * fraction of what the viewer chose. Read it as "one more answer is coming", bounded by
   * `REQUESTED_MEMBERSHIP_SETTLE_MS`.
   */
  isSettlingMemberships: boolean;
} {
  const { personalSpaceId, walletAddress, keyInput, isLoading: personalSpaceLoading } = useBrowseSidebarQuerySource();

  // Held until the account and the personal space both resolve (`usePersonalSpaceId` waits on the
  // smart account itself). Fetching before then would key and cache a featured-only sidebar — the
  // signed-out answer — under the no-wallet key for a signed-in viewer, and drop their own spaces
  // out of the allowlist for as long as that entry stayed fresh.
  //
  // `enabled` narrows that further for callers that only sometimes need the answer — a feed pinned
  // to one space asks nothing of the viewer's own — so they can hold the hook's position in the
  // render without paying for a request they will not read.
  const queryEnabled = enabled && !personalSpaceLoading;

  const requestedSpaces = useAtomValue(requestedMembershipSpacesAtom);

  const { data, isLoading } = useQuery({
    queryKey: browseSidebarDataQueryKey(keyInput),
    queryFn: () => (personalSpaceId ? fetchBrowseSidebarData(personalSpaceId) : loadBrowseSidebarData(walletAddress)),
    enabled: queryEnabled,
    staleTime: 60_000,
    // Re-ask while a request the viewer has just made is missing from the answer.
    //
    // A membership request reaches the indexer a minute or so after the transaction does, so the
    // invalidation `requestSpaceMembership` fires at the moment of writing refetches the answer
    // from *before* it — and nothing tried again until a remount or a tab refocus. What reads this
    // payload sat on the pre-request answer until a hard refresh, the space filter's default among
    // it (GEO-2815).
    //
    // Driven from the optimistic bridge rather than a timer of its own, which bounds it twice over:
    // a request stops counting the moment it lands here, and one that never lands stops counting
    // when `REQUESTED_MEMBERSHIP_SETTLE_MS` passes. The bridge decides only *when to re-ask* —
    // what this hook reports is still the server's answer.
    refetchInterval: query =>
      awaitsRequestedMembership({
        requestedSpaces,
        personalSpaceId,
        walletAddress,
        data: query.state.data,
        now: Date.now(),
      })
        ? REQUESTED_MEMBERSHIP_POLL_MS
        : false,
    // Same reason `usePersonalSpaceId` sets it: a tab nobody is looking at should not spend
    // requests, and a refocus refetches this anyway.
    refetchIntervalInBackground: false,
  });

  // `enabled: false` only stops the fetch — a cache entry already sitting under this key is still
  // handed back, synchronously. While the account is resolving that key is whatever partial
  // identity we have so far, so a signed-out, featured-only entry left over from earlier in the
  // session would answer here and pass for a settled allowlist: the viewer's own spaces filtered
  // out of their own panel, with nothing marking it as still loading. Same gate as the fetch.
  //
  // `enabled: false` joins the same gate. It stops the fetch *and* the refetch interval, so the
  // entry under this key can only go stale from here — handing it back as an answer would let a
  // caller seed off a set this hook was told not to maintain.
  const unresolved = personalSpaceLoading || !enabled || !data;

  const allowlist = React.useMemo(
    () => (unresolved ? null : browseSidebarClaimSpaceAllowlist(data, personalSpaceId)),
    [data, personalSpaceId, unresolved]
  );

  // Same gate, for the same reason: a signed-out entry left over under a partial key would read as
  // a settled answer of "you belong to nothing", which is the case the default treats as a viewer
  // with no memberships and falls back to showing everything. Held as null until it is real.
  const memberSpaceIds = React.useMemo(
    () => (unresolved ? null : browseSidebarMemberSpaceIds(data, personalSpaceId)),
    [data, personalSpaceId, unresolved]
  );

  // Same question the interval asks, answered against the data the caller is being handed.
  const isSettlingMemberships =
    enabled && awaitsRequestedMembership({ requestedSpaces, personalSpaceId, walletAddress, data, now: Date.now() });

  return {
    allowlist,
    memberSpaceIds,
    isLoading: personalSpaceLoading || (queryEnabled && isLoading),
    isSettlingMemberships,
  };
}
