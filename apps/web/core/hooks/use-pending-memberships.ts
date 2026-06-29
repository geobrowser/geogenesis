'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useAtomValue } from 'jotai';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { fetchPendingMembershipSpaceIds } from '~/core/io/subgraph/fetch-pending-membership-space-ids';
import {
  requestedMembershipIdSet,
  requestedMembershipSpacesAtom,
  requestedSpacesForOwner,
} from '~/core/state/requested-membership';
import { normId } from '~/core/utils/norm-id';

export function pendingMembershipsQueryKey(memberSpaceId: string | null | undefined) {
  return ['pending-memberships', memberSpaceId ?? null] as const;
}

/**
 * Durable source of truth for every space the signed-in user has a pending
 * membership request in. Backed by {@link fetchPendingMembershipSpaceIds} and
 * keyed by personal space id so it survives refreshes and is invalidated by
 * {@link useRequestToBeMember} after a new request lands.
 */
export function usePendingMembershipSpaceIds() {
  const { personalSpaceId } = usePersonalSpaceId();

  const { data } = useQuery({
    queryKey: pendingMembershipsQueryKey(personalSpaceId),
    queryFn: () => (personalSpaceId ? fetchPendingMembershipSpaceIds(personalSpaceId) : Promise.resolve([])),
    enabled: !!personalSpaceId,
    staleTime: 30_000,
  });

  return React.useMemo(() => new Set(data ?? []), [data]);
}

/**
 * Combined pending set: the durable server query unioned with the optimistic,
 * persisted local atom (which bridges indexer lag right after a request). All
 * ids are normalized.
 */
export function usePendingMembershipSet(): Set<string> {
  const { personalSpaceId } = usePersonalSpaceId();
  const serverSet = usePendingMembershipSpaceIds();
  const requested = useAtomValue(requestedMembershipSpacesAtom);

  return React.useMemo(() => {
    const combined = new Set(serverSet);
    // Only this account's optimistic entries — never a signed-out user's or a
    // prior account's leftover localStorage state.
    for (const id of requestedMembershipIdSet(requestedSpacesForOwner(requested, personalSpaceId))) {
      combined.add(id);
    }
    return combined;
  }, [serverSet, requested, personalSpaceId]);
}

/** Whether the given space currently has a pending membership request for the user. */
export function useIsMembershipPending(spaceId: string | null | undefined): boolean {
  const pendingSet = usePendingMembershipSet();
  if (!spaceId) return false;
  return pendingSet.has(normId(spaceId));
}
