'use client';

import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import type { BlockRankerPlacement } from './block-rankers';
import { type BlockRankersPageFetchers, readBlockRankers } from './fetch-block-rankers';
import { type RankerIdentity, useRankerIdentities } from './use-ranker-identities';

/**
 * A ranker of one entity on the block: who they are and where they placed it.
 *
 * Identity follows the voters popover (`use-ranker-identities.ts`): profile name and avatar first,
 * the personal space's image when the profile has none. `name` and `avatarUrl` stay null until it
 * resolves, or for good when there is nothing; draw the fallback avatar from `fallbackSeed`.
 */
export type BlockRanker = BlockRankerPlacement & RankerIdentity;

/** Someone whose ballot counts on the block. */
export type BlockRankerBallot = RankerIdentity & {
  spaceId: string;
  rankEntityId: string;
  ballotSize: number;
};

/**
 * - `disabled`: no block id, or `enabled: false`. Nothing is read.
 * - `loading`: the first read is in flight.
 * - `error`: the first read failed and there is no answer to show. `error` says why.
 * - `ready`: there is an answer. If a later re-read failed, this stays `ready` with the last good
 *   answer, and `error` is set.
 */
export type BlockRankersStatus = 'disabled' | 'loading' | 'error' | 'ready';

export type UseBlockRankersArgs = {
  /**
   * The ranking block. Null or undefined disables the read. Pass `BEST_DEBATES_BLOCK_ID` from
   * `best-debates.ts`, which stays null until GEO-3685 creates the block.
   */
  blockId: string | null | undefined;
  /** The block's space; its members and editors are the people whose ballots count. */
  spaceId: string;
  /** False holds the read (e.g. behind a flag). Defaults to true. */
  enabled?: boolean;
};

export type UseBlockRankersResult = {
  status: BlockRankersStatus;
  /**
   * How many counting ballots hold the entity. `null` means unknown: anything but `ready`. Only a
   * `0` while `ready` means "Nobody has ranked this yet".
   */
  rankerCount: (entityId: string) => number | null;
  /** The entity's rankers, best place first. `[]` while `ready` means nobody; `null` unknown. */
  rankersOf: (entityId: string) => BlockRanker[] | null;
  /** Normalized ids of every entity on at least one counting ballot; null unless `ready`. */
  rankedEntityIds: ReadonlySet<string> | null;
  /** Everyone whose ballot counts, in a stable order; null unless `ready`. */
  rankers: BlockRankerBallot[] | null;
  /** True while names and avatars are still resolving; counts don't wait for them. */
  isLoadingIdentities: boolean;
  /** The last read's failure, whether or not an older answer is still shown. */
  error: Error | null;
  /**
   * Re-read the block. After publishing a ballot, call this once indexing has confirmed the edit
   * (the publish result's `indexingSettled`), not right after the publish: an earlier read sees
   * the graph from before the edit and keeps it for `BLOCK_RANKERS_STALE_TIME_MS`.
   */
  invalidate: () => Promise<void>;
};

/** Reads are expensive (every counting ballot is walked), so answers stay fresh for 5 minutes and
 *  re-read only on `invalidate`, a remount after that, or a new block. */
export const BLOCK_RANKERS_STALE_TIME_MS = 5 * 60_000;

export function blockRankersQueryKey(blockId: string | null | undefined, spaceId: string) {
  return ['block-rankers', blockId ? normId(blockId) : null, normId(spaceId)] as const;
}

/** For code outside the hook (e.g. after `indexingSettled`): re-read one block's rankers. */
export function invalidateBlockRankers(queryClient: QueryClient, blockId: string, spaceId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: blockRankersQueryKey(blockId, spaceId) });
}

const NO_SPACE_IDS: string[] = [];
const NO_RANKERS: BlockRanker[] = [];

/**
 * Who ranked each entity on a ranking block (GEO-3686), for the Best debates space page
 * (GEO-3677), the ranking screen's To rank list (GEO-3678) and push-down (GEO-3679).
 *
 * Counts follow the indexer: latest ballot per person, members and editors of `spaceId` only. See
 * `block-rankers.ts` for the rules and `fetch-block-rankers.ts` for the reads. One query per
 * (block, space), shared by every caller through React Query.
 */
export function useBlockRankers(
  { blockId, spaceId, enabled = true }: UseBlockRankersArgs,
  fetchers?: BlockRankersPageFetchers
): UseBlockRankersResult {
  const isEnabled = enabled && Boolean(blockId);
  const queryClient = useQueryClient();
  const queryKey = blockRankersQueryKey(blockId, spaceId);

  const query = useQuery({
    queryKey,
    enabled: isEnabled,
    staleTime: BLOCK_RANKERS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    queryFn: () => readBlockRankers({ blockId: blockId!, spaceId }, fetchers),
  });

  const summary = isEnabled ? query.data : undefined;
  const status: BlockRankersStatus = !isEnabled ? 'disabled' : summary ? 'ready' : query.isError ? 'error' : 'loading';

  const rankerSpaceIds = React.useMemo(
    () => summary?.countingBallots.map(ballot => ballot.spaceId) ?? NO_SPACE_IDS,
    [summary]
  );
  const { identityOf, isLoading: isLoadingIdentities } = useRankerIdentities(rankerSpaceIds, isEnabled);

  const rankersByEntityId = React.useMemo(() => {
    if (!summary) return null;
    const withIdentity = new Map<string, BlockRanker[]>();
    for (const [entityId, placements] of summary.rankersByEntityId) {
      withIdentity.set(
        entityId,
        placements.map(placement => ({ ...placement, ...identityOf(placement.spaceId) }))
      );
    }
    return withIdentity;
  }, [identityOf, summary]);

  const rankedEntityIds = React.useMemo(
    () => (rankersByEntityId ? new Set(rankersByEntityId.keys()) : null),
    [rankersByEntityId]
  );

  const rankers = React.useMemo(
    () => summary?.countingBallots.map(ballot => ({ ...ballot, ...identityOf(ballot.spaceId) })) ?? null,
    [identityOf, summary]
  );

  const rankersOf = React.useCallback(
    (entityId: string): BlockRanker[] | null =>
      rankersByEntityId ? (rankersByEntityId.get(normId(entityId)) ?? NO_RANKERS) : null,
    [rankersByEntityId]
  );
  const rankerCount = React.useCallback((entityId: string) => rankersOf(entityId)?.length ?? null, [rankersOf]);

  const [, keyBlock, keySpace] = queryKey;
  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['block-rankers', keyBlock, keySpace] }),
    [queryClient, keyBlock, keySpace]
  );

  return {
    status,
    rankerCount,
    rankersOf,
    rankedEntityIds,
    rankers,
    isLoadingIdentities: status === 'ready' && isLoadingIdentities,
    error: isEnabled ? (query.error ?? null) : null,
    invalidate,
  };
}
