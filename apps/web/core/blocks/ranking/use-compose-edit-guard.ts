'use client';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { canComposeEditBlock, isBestDebatesBlock } from './best-debates-views';

export type ComposeEditGuard = {
  isBestDebates: boolean;
  /** `canComposeEditBlock` for this viewer. */
  allowed: boolean;
  /**
   * True once `allowed` is final: always on other blocks; on Best debates after the flags have
   * hydrated and the block space's access has been read. Act on a refusal only when settled, or a
   * member would be bounced while their membership loads.
   */
  settled: boolean;
};

/** `canComposeEditBlock` with its inputs read for the current viewer (GEO-3677). */
export function useComposeEditGuard({
  blockId,
  spaceId,
  bestDebatesBlockId,
}: {
  blockId: string | null | undefined;
  spaceId: string;
  /** Tests only: stands in for `BEST_DEBATES_BLOCK_ID`. */
  bestDebatesBlockId?: string | null;
}): ComposeEditGuard {
  const hydrated = useHydrated();
  const flagOn = useFeatureFlag('debateRankings');
  const { canEdit, isLoading } = useAccessControl(spaceId);
  const isBestDebates = isBestDebatesBlock(blockId, spaceId, bestDebatesBlockId);
  const allowed = canComposeEditBlock({ blockId, spaceId, flagOn, canEdit, bestDebatesBlockId });
  return { isBestDebates, allowed, settled: !isBestDebates || (hydrated && !isLoading) };
}
