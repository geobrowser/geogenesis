'use client';

import { IdUtils } from '@geoprotocol/geo-sdk/lite';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { buildExpressInterestOps } from '~/core/bounties/interest-ops';
import { INTERESTED_IN_BOUNTY_PROPERTY_ID } from '~/core/bounties/ontology';
import { bountyQueryKeys } from '~/core/bounties/use-bounties';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePublish } from '~/core/hooks/use-publish';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
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
 * Write shape — deliberately the same as curator-app's `create-interested-in-bounty-relation.ts`
 * and every interest row already on testnet: `person entity → bounty`, no `toSpaceId`.
 * An earlier geogenesis build authored this from the personal space's *system* entity
 * (the entity whose id is the space id) with a `toSpaceId`; we chose the curator shape
 * so the two apps produce identical rows and neither app's readers need to special-case
 * the other. Readers on both sides accept both shapes (see `useBountyRoles` /
 * `buildBountyAllocationTargets`), so rows written by the old build still count. The
 * person entity falls back to the space's system entity only when no profile entity
 * exists — the same fallback curator-app's profile resolution makes.
 *
 * Ops are built by `buildExpressInterestOps` (shared with the bounty detail page) and
 * handed straight to `makeProposal`, like the rest of the bounty writes.
 */
export function useInterestedInBounty() {
  const { makeProposal } = usePublish();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const { profile } = useGeoProfile(smartAccount?.account.address);
  const queryClient = useQueryClient();
  const [pendingBountyId, setPendingBountyId] = React.useState<string | null>(null);
  // Bounties already submitted this session. The interested-in query only refreshes
  // once the proposal is indexed, so without this a second click in that window
  // would write a duplicate relation. A ref, not state, so the guard is readable
  // synchronously within a single click's handler.
  const submittedBountyIds = React.useRef<Set<string>>(new Set());

  const canRegisterInterest = Boolean(personalSpaceId && isRegistered);

  const registerInterest = React.useCallback(
    async ({ bountyId, bountyName }: ProposeInterestArgs) => {
      if (!personalSpaceId || !isRegistered) return;
      if (submittedBountyIds.current.has(bountyId)) return;

      submittedBountyIds.current.add(bountyId);
      setPendingBountyId(bountyId);

      const personEntityId =
        profile?.id && IdUtils.isValid(profile.id) && profile.id !== profile.spaceId ? profile.id : personalSpaceId;
      const { relations } = buildExpressInterestOps({
        personalSpaceId,
        person: { id: personEntityId, name: profile?.name ?? null },
        bounty: { id: bountyId, name: bountyName },
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
    [isRegistered, makeProposal, personalSpaceId, profile, queryClient]
  );

  return { registerInterest, pendingBountyId, canRegisterInterest };
}
