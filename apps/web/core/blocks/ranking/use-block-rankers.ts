'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { normId } from '~/core/utils/norm-id';

import type { BlockRankerPlacement, BlockRankersSummary } from './block-rankers';
import { type BlockRankersPageFetchers, readBlockRankers } from './fetch-block-rankers';

/**
 * A ranker of one entity on the block: who they are and where they placed it.
 *
 * `name` and `avatarUrl` are null until the ranker's personal space resolves (and stay null when it
 * has none); render a fallback rather than waiting on them.
 */
export type BlockRanker = BlockRankerPlacement & {
  name: string | null;
  avatarUrl: string | null;
};

export type UseBlockRankersArgs = {
  /**
   * The ranking block. Null or undefined disables the read and every answer is empty; pass
   * `BEST_DEBATES_BLOCK_ID` from `best-debates.ts`, which stays null until GEO-3685 creates the
   * block.
   */
  blockId: string | null | undefined;
  /** The block's space; its members and editors are the people whose ballots count. */
  spaceId: string;
  /** False holds the read (e.g. behind a flag). Defaults to true. */
  enabled?: boolean;
};

export type UseBlockRankersResult = {
  /** How many counting ballots hold the entity; 0 for "Nobody has ranked this yet". */
  rankerCount: (entityId: string) => number;
  /** The entity's rankers, best place first; empty when nobody ranked it. Stable per entity. */
  rankersOf: (entityId: string) => BlockRanker[];
  /** Normalized ids of every entity on at least one counting ballot. */
  rankedEntityIds: ReadonlySet<string>;
  /** Everyone whose ballot counts, with identity and ballot size, in a stable order. */
  rankers: Array<{
    spaceId: string;
    rankEntityId: string;
    ballotSize: number;
    name: string | null;
    avatarUrl: string | null;
  }>;
  /** True until the first answer arrives (false while disabled). Counts read 0 meanwhile. */
  isLoading: boolean;
  /** True while names and avatars are still resolving; counts are already final. */
  isLoadingIdentities: boolean;
  /** Set when a read failed. Counts read 0; don't show "Nobody has ranked this yet" off them. */
  error: Error | null;
  /** Re-read after publishing a ballot, so the author's own change shows. */
  refetch: () => Promise<unknown>;
};

export function blockRankersQueryKey(blockId: string | null | undefined, spaceId: string) {
  return ['block-rankers', blockId ? normId(blockId) : null, normId(spaceId)] as const;
}

const NO_RANKERS: BlockRanker[] = [];
const EMPTY_SUMMARY: BlockRankersSummary = { rankersByEntityId: new Map(), countingBallots: [] };

/**
 * Who ranked each entity on a ranking block (GEO-3686), for the Best debates space page
 * (GEO-3677), the ranking screen's To rank list (GEO-3678) and push-down (GEO-3679).
 *
 * Counts follow the indexer: latest ballot per person, members and editors of `spaceId` only. See
 * `block-rankers.ts` for the rules and `fetch-block-rankers.ts` for the reads. One query per
 * (block, space), shared by every caller through React Query; call `refetch` after publishing.
 */
export function useBlockRankers(
  { blockId, spaceId, enabled = true }: UseBlockRankersArgs,
  fetchers?: BlockRankersPageFetchers
): UseBlockRankersResult {
  const isEnabled = enabled && Boolean(blockId);

  const query = useQuery({
    queryKey: blockRankersQueryKey(blockId, spaceId),
    enabled: isEnabled,
    staleTime: 30_000,
    queryFn: () => readBlockRankers({ blockId: blockId!, spaceId }, fetchers),
  });

  const summary = (isEnabled ? query.data : undefined) ?? EMPTY_SUMMARY;

  const rankerSpaceIds = React.useMemo(
    () => summary.countingBallots.map(ballot => ballot.spaceId),
    [summary.countingBallots]
  );
  const { spacesById, isLoading: isLoadingIdentities } = useSpacesByIds(rankerSpaceIds, isEnabled);

  const identityBySpaceId = React.useMemo(() => {
    const identities = new Map<string, { name: string | null; avatarUrl: string | null }>();
    for (const space of spacesById.values()) {
      const image = space.entity?.image ?? null;
      identities.set(normId(space.id), {
        name: space.entity?.name ?? null,
        avatarUrl: image && image !== PLACEHOLDER_SPACE_IMAGE ? image : null,
      });
    }
    return identities;
  }, [spacesById]);

  const rankersByEntityId = React.useMemo(() => {
    const withIdentity = new Map<string, BlockRanker[]>();
    for (const [entityId, placements] of summary.rankersByEntityId) {
      withIdentity.set(
        entityId,
        placements.map(placement => ({
          ...placement,
          name: identityBySpaceId.get(placement.spaceId)?.name ?? null,
          avatarUrl: identityBySpaceId.get(placement.spaceId)?.avatarUrl ?? null,
        }))
      );
    }
    return withIdentity;
  }, [identityBySpaceId, summary.rankersByEntityId]);

  const rankedEntityIds = React.useMemo(() => new Set(rankersByEntityId.keys()), [rankersByEntityId]);

  const rankers = React.useMemo(
    () =>
      summary.countingBallots.map(ballot => ({
        ...ballot,
        name: identityBySpaceId.get(ballot.spaceId)?.name ?? null,
        avatarUrl: identityBySpaceId.get(ballot.spaceId)?.avatarUrl ?? null,
      })),
    [identityBySpaceId, summary.countingBallots]
  );

  const rankersOf = React.useCallback(
    (entityId: string) => rankersByEntityId.get(normId(entityId)) ?? NO_RANKERS,
    [rankersByEntityId]
  );
  const rankerCount = React.useCallback((entityId: string) => rankersOf(entityId).length, [rankersOf]);

  const { refetch } = query;

  return {
    rankerCount,
    rankersOf,
    rankedEntityIds,
    rankers,
    isLoading: isEnabled && query.isLoading,
    isLoadingIdentities: isEnabled && isLoadingIdentities,
    error: isEnabled ? (query.error ?? null) : null,
    refetch: React.useCallback(() => refetch(), [refetch]),
  };
}
