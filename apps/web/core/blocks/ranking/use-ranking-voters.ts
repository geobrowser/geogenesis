'use client';

import * as React from 'react';

import type { AggregatedRankingSubmitterRef } from './ranking-block-relations';
import { type RankerIdentity, useRankerIdentities } from './use-ranker-identities';
import { useRankEntitySpaceById } from './use-ranking-submitter-space-ids';

/** Identity resolution is shared with `useBlockRankers` (`use-ranker-identities.ts`). */
export type RankingVoter = RankerIdentity & {
  rankEntityId: string;
  spaceId: string;
};

export function useRankingVoters(refs: AggregatedRankingSubmitterRef[]) {
  const { rankEntitySpaceById, isResolvingSpaces } = useRankEntitySpaceById(refs);

  const resolvedRefs = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { rankEntityId: string; spaceId: string }[] = [];
    for (const ref of refs) {
      const spaceId = ref.spaceId ?? rankEntitySpaceById.get(ref.rankEntityId);
      if (!spaceId || seen.has(spaceId)) continue;
      seen.add(spaceId);
      out.push({ rankEntityId: ref.rankEntityId, spaceId });
    }
    return out;
  }, [refs, rankEntitySpaceById]);

  const spaceIds = React.useMemo(() => resolvedRefs.map(ref => ref.spaceId), [resolvedRefs]);

  const { identityOf, isLoading: isLoadingProfiles } = useRankerIdentities(spaceIds);

  const voters: RankingVoter[] = React.useMemo(
    () =>
      resolvedRefs.map(ref => ({ rankEntityId: ref.rankEntityId, spaceId: ref.spaceId, ...identityOf(ref.spaceId) })),
    [resolvedRefs, identityOf]
  );

  // `isResolvingSpaces` has to be part of this. Refs whose relation carried no `to_space` — the
  // common shape on testnet — contribute nothing to `spaceIds` until their home space is looked up,
  // so a flag derived only from the profiles query reads `false` for that whole window and the
  // popover renders zero rows with no skeleton, under a footer already claiming N voters.
  const isLoading = isResolvingSpaces || isLoadingProfiles;

  return { voters, isLoading };
}
