'use client';

import { IdUtils, Position } from '@geoprotocol/geo-sdk/lite';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { INTERESTED_IN_RELATION_TYPE_ID } from '~/core/constants';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePublish } from '~/core/hooks/use-publish';
import { getRelationsByToEntityIds } from '~/core/io/queries';
import { useMutate } from '~/core/sync/use-mutate';
import type { Relation } from '~/core/types';

const INTERESTED_IN_QUERY_KEY = 'bounty-interested-in';

export function useInterestedBountyIds(bountyIds: string[]) {
  const { personalSpaceId } = usePersonalSpaceId();
  const key = [...bountyIds].sort().join(',');

  const { data } = useQuery({
    enabled: Boolean(personalSpaceId) && bountyIds.length > 0,
    queryKey: [INTERESTED_IN_QUERY_KEY, personalSpaceId, key],
    queryFn: () => {
      if (!personalSpaceId) return Promise.resolve([]);
      return Effect.runPromise(getRelationsByToEntityIds(bountyIds, INTERESTED_IN_RELATION_TYPE_ID, personalSpaceId));
    },
    staleTime: 60_000,
  });

  return React.useMemo(
    () => new Set((data ?? []).map(relation => relation.toEntityId).filter(Boolean) as string[]),
    [data]
  );
}

type ProposeInterestArgs = {
  bountyId: string;
  bountyName: string;
  bountySpaceId: string;
};

/**
 * Registers interest in a bounty by writing an `Interested in` relation from the
 * user's personal-space system entity to the bounty.
 *
 * The system entity is the one whose entity id *is* the space id, which is why the
 * relation comes from `personalSpaceId` rather than the space's topic entity.
 */
export function useInterestedInBounty() {
  const { storage } = useMutate();
  const { makeProposal } = usePublish();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const queryClient = useQueryClient();
  const [pendingBountyId, setPendingBountyId] = React.useState<string | null>(null);

  const canRegisterInterest = Boolean(personalSpaceId && isRegistered);

  const registerInterest = React.useCallback(
    async ({ bountyId, bountyName, bountySpaceId }: ProposeInterestArgs) => {
      if (!personalSpaceId || !isRegistered) return;

      setPendingBountyId(bountyId);

      const relation: Relation = {
        id: IdUtils.generate(),
        entityId: IdUtils.generate(),
        spaceId: personalSpaceId,
        toSpaceId: bountySpaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        isLocal: true,
        hasBeenPublished: false,
        isDeleted: false,
        type: { id: INTERESTED_IN_RELATION_TYPE_ID, name: 'Interested in' },
        fromEntity: { id: personalSpaceId, name: null },
        toEntity: { id: bountyId, name: bountyName, value: bountyId },
      };

      storage.relations.set(relation);

      try {
        await makeProposal({
          values: [],
          relations: [relation],
          spaceId: personalSpaceId,
          name: `Interested in: ${bountyName}`,
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: [INTERESTED_IN_QUERY_KEY, personalSpaceId] });
          },
        });
      } finally {
        setPendingBountyId(null);
      }
    },
    [isRegistered, makeProposal, personalSpaceId, queryClient, storage.relations]
  );

  return { registerInterest, pendingBountyId, canRegisterInterest };
}
