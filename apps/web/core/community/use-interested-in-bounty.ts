'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { buildExpressInterestOps } from '~/core/bounties/interest-ops';
import { INTERESTED_IN_BOUNTY_PROPERTY_ID } from '~/core/bounties/ontology';
import { bountyQueryKeys } from '~/core/bounties/use-bounties';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePublish } from '~/core/hooks/use-publish';
import { getRelationsByToEntityIds } from '~/core/io/queries';

const INTERESTED_IN_QUERY_KEY = 'bounty-interested-in';

export function useInterestedBountyIds(bountyIds: string[]) {
  const { personalSpaceId } = usePersonalSpaceId();
  const key = [...bountyIds].sort().join(',');

  // Scoped to the viewer's personal space but deliberately not to a `fromEntityId`:
  // interest relations may be authored from the person entity (curator-app and this
  // app) or from the space's system entity (earlier geogenesis builds), and both should
  // read as interested. Only the viewer's own space is in scope either way, so the
  // looser filter can't leak someone else's interest.
  const { data, isLoading } = useQuery({
    enabled: Boolean(personalSpaceId) && bountyIds.length > 0,
    queryKey: [INTERESTED_IN_QUERY_KEY, personalSpaceId, key],
    queryFn: () => {
      if (!personalSpaceId) return Promise.resolve([]);
      return Effect.runPromise(getRelationsByToEntityIds(bountyIds, INTERESTED_IN_BOUNTY_PROPERTY_ID, personalSpaceId));
    },
    staleTime: 60_000,
  });

  const interestedIds = React.useMemo(
    () => new Set((data ?? []).map(relation => relation.toEntityId).filter(Boolean) as string[]),
    [data]
  );

  // Until the first fetch settles every bounty looks un-registered, so callers need
  // this to avoid offering a button that would write a duplicate relation.
  return { interestedIds, isLoading };
}

type ProposeInterestArgs = {
  bountyId: string;
  bountyName: string;
  bountySpaceId: string;
};

/**
 * Registers interest in a bounty: one `Interested In` relation, published into the
 * viewer's personal space.
 *
 * Write shape — the standardized geogenesis shape: `personal-space system entity
 * (the entity whose id is the space id) → bounty`, with `toSpaceId` set to the
 * bounty's DAO space. Legacy rows on testnet use curator-app's person-entity
 * shape with no `toSpaceId`; readers on both sides accept both (see
 * `useBountyRoles` / `buildBountyAllocationTargets`), so old rows still count.
 *
 * Ops are built by `buildExpressInterestOps` (shared with the bounty detail page) and
 * handed straight to `makeProposal`, like the rest of the bounty writes.
 */
export function useInterestedInBounty() {
  const { makeProposal } = usePublish();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const queryClient = useQueryClient();
  const [pendingBountyId, setPendingBountyId] = React.useState<string | null>(null);
  // Bounties already submitted this session. The interested-in query only refreshes
  // once the proposal is indexed, so without this a second click in that window
  // would write a duplicate relation. A ref, not state, so the guard is readable
  // synchronously within a single click's handler.
  const submittedBountyIds = React.useRef<Set<string>>(new Set());

  const canRegisterInterest = Boolean(personalSpaceId && isRegistered);

  const registerInterest = React.useCallback(
    async ({ bountyId, bountyName, bountySpaceId }: ProposeInterestArgs) => {
      if (!personalSpaceId || !isRegistered) return;
      if (submittedBountyIds.current.has(bountyId)) return;

      submittedBountyIds.current.add(bountyId);
      setPendingBountyId(bountyId);

      const { relations } = buildExpressInterestOps({
        personalSpaceId,
        bounty: { id: bountyId, name: bountyName },
        bountySpaceId,
      });

      try {
        await makeProposal({
          values: [],
          relations,
          spaceId: personalSpaceId,
          name: `Interested in: ${bountyName}`,
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: [INTERESTED_IN_QUERY_KEY, personalSpaceId] });
            void queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all });
          },
          onError: () => {
            // Failed publishes are retryable, so release the guard.
            submittedBountyIds.current.delete(bountyId);
          },
        });
      } finally {
        setPendingBountyId(null);
      }
    },
    [isRegistered, makeProposal, personalSpaceId, queryClient]
  );

  return { registerInterest, pendingBountyId, canRegisterInterest };
}
