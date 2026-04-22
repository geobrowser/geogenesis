'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { BOUNTIES_RELATION_TYPE, BOUNTY_TYPE_ID, PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getAllEntities, getRelationsByToEntityIds, getSpaces } from '~/core/io/queries';
import { fetchSpacesWithAncestors } from '~/core/io/subgraph/fetch-spaces-with-ancestors';
import { useRelations, useValues } from '~/core/sync/use-store';

import {
  buildBounties,
  buildBounty,
  buildBountyAllocationTargets,
  hasBountyTaskStatusDoneRelation,
  isAllocatedToUser,
  isBountyTypeRelation,
} from './build-bounties';
import type { Bounty } from './types';

type UseLinkableBountiesArgs = {
  /** The space whose bounties (plus ancestors) should be offered for linking. */
  activeSpace: string;
  /** The logged-in user's personal space id. Null when signed-out; the hook returns empty. */
  personalSpaceId: string | null;
  /** The logged-in user's personal page entity id. */
  personalPageEntityId: string | null;
  /** Gate the queries — pass `false` to skip fetching (e.g. when the panel is closed). */
  enabled?: boolean;
};

function bountySpaceFallbackLabel(spaceId: string): string {
  const compact = spaceId.replace(/-/g, '');
  return compact.length > 14 ? `${compact.slice(0, 6)}…${compact.slice(-4)}` : spaceId;
}

/**
 * Fetches the list of bounties the current user can link from `activeSpace` (and its ancestor spaces).
 * Merges remote bounty entities with locally-edited bounty entities in the sync store, counts
 * submissions, and attaches space labels/images for the card footer. Behavior matches the prior
 * inline logic in `review-changes.tsx`.
 */
export function useLinkableBounties({
  activeSpace,
  personalSpaceId,
  personalPageEntityId,
  enabled = true,
}: UseLinkableBountiesArgs): { bounties: Bounty[]; bountiesById: Map<string, Bounty>; isLoading: boolean } {
  const bountyTypeRelations = useRelations({
    selector: r => r.spaceId === activeSpace && r.type.id === SystemIds.TYPES_PROPERTY && r.isDeleted !== true,
  });

  const bountyEntityIds = React.useMemo(() => {
    const ids = bountyTypeRelations.filter(isBountyTypeRelation).map(relation => relation.fromEntity.id);
    return [...new Set(ids)];
  }, [bountyTypeRelations]);

  const bountyEntityIdSet = React.useMemo(() => new Set(bountyEntityIds), [bountyEntityIds]);

  const bountyValues = useValues({
    selector: value =>
      value.spaceId === activeSpace && bountyEntityIdSet.has(value.entity.id) && value.isDeleted !== true,
  });

  const bountyRelations = useRelations({
    selector: relation =>
      relation.spaceId === activeSpace && bountyEntityIdSet.has(relation.fromEntity.id) && relation.isDeleted !== true,
  });

  const { data: bountySearchSpaceIds = [], isLoading: isLoadingAncestors } = useQuery({
    queryKey: ['bounty-link-spaces-with-ancestors', activeSpace],
    enabled: Boolean(activeSpace && enabled),
    staleTime: 60_000,
    queryFn: async () => {
      if (!activeSpace) return [];
      return await fetchSpacesWithAncestors(activeSpace);
    },
  });

  const { data: remoteBountyEntities = [], isLoading: isLoadingRemote } = useQuery({
    queryKey: ['bounties-by-type', bountySearchSpaceIds.join(','), BOUNTY_TYPE_ID],
    enabled: bountySearchSpaceIds.length > 0 && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      if (bountySearchSpaceIds.length === 0) return [];
      const pages = await Promise.all(
        bountySearchSpaceIds.map(spaceId =>
          Effect.runPromise(
            getAllEntities({
              spaceId,
              typeIds: { is: BOUNTY_TYPE_ID },
            })
          )
        )
      );
      const merged = new Map<string, (typeof pages)[0][0]>();
      for (const entities of pages) {
        for (const entity of entities) {
          merged.set(entity.id, entity);
        }
      }
      return [...merged.values()];
    },
  });

  const allBountyIds = React.useMemo(() => {
    const remoteIds = remoteBountyEntities.map(entity => entity.id);
    return [...new Set([...bountyEntityIds, ...remoteIds])].sort();
  }, [bountyEntityIds, remoteBountyEntities]);

  const { data: bountySubmissionRelations = [], isLoading: isLoadingSubmissions } = useQuery({
    queryKey: ['bounty-submission-relations', allBountyIds],
    enabled: allBountyIds.length > 0 && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      return await Effect.runPromise(getRelationsByToEntityIds(allBountyIds, BOUNTIES_RELATION_TYPE));
    },
  });

  const { data: bountyPersonalSubmissionRelations = [], isLoading: isLoadingPersonalSubmissions } = useQuery({
    queryKey: ['bounty-submission-relations-personal', allBountyIds, personalSpaceId],
    enabled: allBountyIds.length > 0 && enabled && Boolean(personalSpaceId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!personalSpaceId) return [];
      return await Effect.runPromise(getRelationsByToEntityIds(allBountyIds, BOUNTIES_RELATION_TYPE, personalSpaceId));
    },
  });

  const bountySubmissionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const relation of bountySubmissionRelations) {
      const id = relation.toEntityId;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [bountySubmissionRelations]);

  const bountyPersonalSubmissionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const relation of bountyPersonalSubmissionRelations) {
      const id = relation.toEntityId;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [bountyPersonalSubmissionRelations]);

  const { bounties, bountiesById } = React.useMemo(() => {
    if (!personalSpaceId) {
      return { bounties: [] as Bounty[], bountiesById: new Map<string, Bounty>() };
    }

    const allocationTargets = buildBountyAllocationTargets(personalSpaceId, personalPageEntityId);
    const localResult = buildBounties(
      bountyEntityIds,
      bountyValues,
      bountyRelations,
      bountySubmissionCounts,
      bountyPersonalSubmissionCounts,
      allocationTargets,
      activeSpace,
      personalSpaceId
    );
    const remoteBounties = remoteBountyEntities
      .filter(
        entity =>
          isAllocatedToUser(entity.relations ?? [], allocationTargets) &&
          !hasBountyTaskStatusDoneRelation(entity.relations ?? [])
      )
      .map(entity => {
        const bountySpaceId = entity.spaces?.[0] ?? activeSpace;
        return buildBounty(
          entity.id,
          entity.values ?? [],
          entity.relations ?? [],
          bountySubmissionCounts,
          bountyPersonalSubmissionCounts,
          bountySpaceId,
          personalSpaceId
        );
      });

    const merged = new Map<string, Bounty>();
    for (const bounty of remoteBounties) merged.set(bounty.id, bounty);
    for (const bounty of localResult.bounties) merged.set(bounty.id, bounty);

    return { bounties: Array.from(merged.values()), bountiesById: merged };
  }, [
    bountyEntityIds,
    bountyValues,
    bountyRelations,
    remoteBountyEntities,
    bountySubmissionCounts,
    bountyPersonalSubmissionCounts,
    activeSpace,
    personalSpaceId,
    personalPageEntityId,
  ]);

  const bountySpaceIdsForLabels = React.useMemo(
    () => [...new Set(bounties.map(b => b.spaceId).filter((id): id is string => Boolean(id)))].sort(),
    [bounties]
  );

  const { data: bountyLabelSpaces = [], isLoading: isLoadingLabels } = useQuery({
    queryKey: ['bounty-space-labels', bountySpaceIdsForLabels.join(',')],
    enabled: bountySpaceIdsForLabels.length > 0 && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      if (bountySpaceIdsForLabels.length === 0) return [];
      return await Effect.runPromise(getSpaces({ spaceIds: bountySpaceIdsForLabels }));
    },
  });

  const bountiesWithSpaceLabels = React.useMemo((): Bounty[] => {
    const spacesById = new Map(bountyLabelSpaces.map(s => [s.id, s]));
    const row = new Map<string, { label: string; image: string }>();
    for (const id of bountySpaceIdsForLabels) {
      const space = spacesById.get(id);
      const name = space?.entity?.name?.trim();
      const label = name && name.length > 0 ? name : bountySpaceFallbackLabel(id);
      const image =
        space?.entity?.image && space.entity.image.length > 0 ? space.entity.image : PLACEHOLDER_SPACE_IMAGE;
      row.set(id, { label, image });
    }

    return bounties.map(b => {
      const r = b.spaceId ? row.get(b.spaceId) : undefined;
      return {
        ...b,
        spaceLabel: b.spaceId ? (r?.label ?? bountySpaceFallbackLabel(b.spaceId)) : null,
        spaceImage: b.spaceId ? (r?.image ?? PLACEHOLDER_SPACE_IMAGE) : null,
      };
    });
  }, [bounties, bountySpaceIdsForLabels, bountyLabelSpaces]);

  const bountiesByIdWithLabels = React.useMemo(() => {
    const m = new Map<string, Bounty>();
    for (const b of bountiesWithSpaceLabels) m.set(b.id, b);
    return m;
  }, [bountiesWithSpaceLabels]);

  return {
    bounties: bountiesWithSpaceLabels,
    bountiesById: bountiesByIdWithLabels,
    isLoading:
      isLoadingAncestors ||
      isLoadingRemote ||
      isLoadingSubmissions ||
      isLoadingPersonalSubmissions ||
      isLoadingLabels,
  };
}