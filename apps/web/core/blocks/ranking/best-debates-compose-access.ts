import { isBestDebatesBlock } from './best-debates-views';

/**
 * Whether the viewer may compose (edit) a ballot on this block. The same rule and name as #3105's
 * `canComposeEdit` in `useRankingBlockState` (GEO-3677): on the Best debates block it needs the
 * `debateRankings` flag and membership of the Debates space (`canEdit` from
 * `useRankingComposeAccess`); every other block can always compose.
 *
 * Local until the stack is stitched: #3105 exports this rule from `use-ranking-block-state.ts` and
 * adds the compose screen's mount guard (no `ensureAccess`, redirect to view, no publish) on it.
 * When that lands, import it from there and delete this file.
 */
export function canComposeEditRanking({
  isBestDebates,
  debateRankingsFlag,
  canEdit,
}: {
  isBestDebates: boolean;
  debateRankingsFlag: boolean;
  canEdit: boolean | undefined;
}): boolean {
  return !isBestDebates || (debateRankingsFlag && Boolean(canEdit));
}

export type BestDebatesComposeMode =
  /** Not the Best debates block, or a viewer who may not compose there: the screen as before. */
  | 'generic'
  /**
   * The Best debates block while the flag (until hydration) or membership is still unknown. The
   * screen shows its loading state rather than the generic screen, which would flash and could file
   * items under the block's space.
   */
  | 'loading'
  /** The Best debates ranking screen (GEO-3678). */
  | 'best-debates';

/**
 * Which compose screen the viewer gets. The additions show only on the Debates space's Best
 * debates block, and only when the viewer may compose there (`canComposeEditRanking`). Anyone else
 * gets the generic screen, which #3105's guard sends to the read-only view.
 */
export function bestDebatesComposeMode({
  blockId,
  spaceId,
  hydrated,
  isLoadingAccess,
  debateRankingsFlag,
  canEdit,
  bestDebatesBlockId,
}: {
  blockId: string;
  spaceId: string;
  /** False until the client has hydrated, while feature flags still read their defaults. */
  hydrated: boolean;
  isLoadingAccess: boolean;
  debateRankingsFlag: boolean;
  canEdit: boolean | undefined;
  /** Tests only: stands in for `BEST_DEBATES_BLOCK_ID`. */
  bestDebatesBlockId?: string | null;
}): BestDebatesComposeMode {
  const isBestDebates =
    bestDebatesBlockId === undefined
      ? isBestDebatesBlock(blockId, spaceId)
      : isBestDebatesBlock(blockId, spaceId, bestDebatesBlockId);
  if (!isBestDebates) return 'generic';
  if (!hydrated) return 'loading';
  if (canComposeEditRanking({ isBestDebates, debateRankingsFlag, canEdit })) return 'best-debates';
  return debateRankingsFlag && isLoadingAccess ? 'loading' : 'generic';
}
