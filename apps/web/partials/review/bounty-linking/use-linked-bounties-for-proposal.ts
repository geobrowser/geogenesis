'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { BOUNTIES_RELATION_TYPE, PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getBatchEntities, getRelationsByToEntityIds, getSpaces } from '~/core/io/queries';

import { buildBounty } from './build-bounties';
import type { Bounty } from './types';

type UseLinkedBountiesForProposalArgs = {
  /** The on-chain proposal id — also the Proposal entity id when the link was created via the
   *  standard flow (review-changes.tsx passes the same id to both `makeProposal` and the
   *  relation's `fromEntity.id`). Pass null/undefined to skip fetching. */
  proposalId: string | null | undefined;
  /** Gate the queries — pass `false` to skip fetching (e.g. when the proposal slide-up is
   *  closed). Defaults to `true`. */
  enabled?: boolean;
};

function bountySpaceFallbackLabel(spaceId: string): string {
  const compact = spaceId.replace(/-/g, '');
  return compact.length > 14 ? `${compact.slice(0, 6)}…${compact.slice(-4)}` : spaceId;
}

/**
 * Returns the set of bounties currently linked to `proposalId` by walking the Proposal
 * entity's outgoing `BOUNTIES_RELATION_TYPE` relations and hydrating the bounty entities.
 */
export function useLinkedBountiesForProposal({
  proposalId,
  enabled = true,
}: UseLinkedBountiesForProposalArgs): { linkedBounties: Bounty[]; isLoading: boolean } {
  const gated = Boolean(enabled && proposalId);

  const { data: proposalEntities = [], isLoading: isLoadingProposal } = useQuery({
    queryKey: ['proposal-entity-for-bounty-links', proposalId],
    enabled: gated,
    staleTime: 30_000,
    queryFn: async () => {
      if (!proposalId) return [];
      return await Effect.runPromise(getBatchEntities([proposalId]));
    },
  });

  const linkedBountyIds = React.useMemo(() => {
    const proposalEntity = proposalEntities[0];
    if (!proposalEntity) return [] as string[];
    const ids = (proposalEntity.relations ?? [])
      .filter(r => r.type.id === BOUNTIES_RELATION_TYPE && r.isDeleted !== true)
      .map(r => r.toEntity?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return [...new Set(ids)].sort();
  }, [proposalEntities]);

  const { data: bountyEntities = [], isLoading: isLoadingBounties } = useQuery({
    queryKey: ['linked-bounty-entities', linkedBountyIds],
    enabled: gated && linkedBountyIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      if (linkedBountyIds.length === 0) return [];
      return await Effect.runPromise(getBatchEntities(linkedBountyIds));
    },
  });

  const { data: submissionRelations = [] } = useQuery({
    queryKey: ['linked-bounty-submissions', linkedBountyIds],
    enabled: gated && linkedBountyIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      if (linkedBountyIds.length === 0) return [];
      return await Effect.runPromise(getRelationsByToEntityIds(linkedBountyIds, BOUNTIES_RELATION_TYPE));
    },
  });

  const submissionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const relation of submissionRelations) {
      const id = relation.toEntityId;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [submissionRelations]);

  const bountySpaceIds = React.useMemo(
    () =>
      [
        ...new Set(
          bountyEntities.flatMap(e => (e.spaces ?? []).filter((s): s is string => typeof s === 'string' && s.length > 0))
        ),
      ].sort(),
    [bountyEntities]
  );

  const { data: spaceRows = [] } = useQuery({
    queryKey: ['linked-bounty-space-labels', bountySpaceIds.join(',')],
    enabled: gated && bountySpaceIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      if (bountySpaceIds.length === 0) return [];
      return await Effect.runPromise(getSpaces({ spaceIds: bountySpaceIds }));
    },
  });

  const linkedBounties = React.useMemo((): Bounty[] => {
    if (bountyEntities.length === 0) return [];

    const spaceRow = new Map<string, { label: string; image: string }>();
    for (const id of bountySpaceIds) {
      const space = spaceRows.find(s => s.id === id);
      const name = space?.entity?.name?.trim();
      const label = name && name.length > 0 ? name : bountySpaceFallbackLabel(id);
      const image =
        space?.entity?.image && space.entity.image.length > 0 ? space.entity.image : PLACEHOLDER_SPACE_IMAGE;
      spaceRow.set(id, { label, image });
    }

    // Empty map for the "your submissions" slot. The proposal view shows a read-only
    // summary of which bounties are linked; per-user submission count is not relevant
    // here and would add a round-trip.
    const emptyPersonalCounts = new Map<string, number>();

    return bountyEntities.map(entity => {
      const bountySpaceId = entity.spaces?.[0] ?? undefined;
      const bounty = buildBounty(
        entity.id,
        entity.values ?? [],
        entity.relations ?? [],
        submissionCounts,
        emptyPersonalCounts,
        bountySpaceId
      );
      const row = bountySpaceId ? spaceRow.get(bountySpaceId) : undefined;
      return {
        ...bounty,
        spaceLabel: bountySpaceId ? (row?.label ?? bountySpaceFallbackLabel(bountySpaceId)) : null,
        spaceImage: bountySpaceId ? (row?.image ?? PLACEHOLDER_SPACE_IMAGE) : null,
      };
    });
  }, [bountyEntities, bountySpaceIds, spaceRows, submissionCounts]);

  return { linkedBounties, isLoading: isLoadingProposal || isLoadingBounties };
}
