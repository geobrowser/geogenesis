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

/**
 * The Best debates ranking screen's additions (GEO-3678) show only on the Debates space's Best
 * debates block, and only when the viewer may compose there. Anyone else gets the generic screen,
 * which #3105's guard sends to the read-only view.
 */
export function showBestDebatesCompose({
  blockId,
  spaceId,
  debateRankingsFlag,
  canEdit,
  bestDebatesBlockId,
}: {
  blockId: string;
  spaceId: string;
  debateRankingsFlag: boolean;
  canEdit: boolean | undefined;
  /** Tests only: stands in for `BEST_DEBATES_BLOCK_ID`. */
  bestDebatesBlockId?: string | null;
}): boolean {
  const isBestDebates =
    bestDebatesBlockId === undefined
      ? isBestDebatesBlock(blockId, spaceId)
      : isBestDebatesBlock(blockId, spaceId, bestDebatesBlockId);
  return isBestDebates && canComposeEditRanking({ isBestDebates, debateRankingsFlag, canEdit });
}
