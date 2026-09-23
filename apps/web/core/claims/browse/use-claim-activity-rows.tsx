'use client';

import * as React from 'react';

import {
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
} from '~/core/debates/ontology';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { useQueryEntities } from '~/core/sync/use-store';

import type { CommentActivityRow } from '~/partials/comments/types';

import { debateDate, relationTargets } from './claim-debates';
import { DebateActivityRow } from './debate-activity-row';
import { useDebateKeyframes } from './use-debate-keyframes';

/**
 * How many debates the activity feed carries.
 *
 * Bounded rather than paged, unlike the Debates tab. These rows are ordered in among the comments,
 * so a pager here would be a pager over half a list — and the tab exists precisely to be the
 * complete, navigable index. A claim with more debates than this shows its most recent and sends
 * the reader to the tab for the rest.
 */
const ACTIVITY_DEBATE_LIMIT = 10;

const NO_ROWS: CommentActivityRow[] = [];

/**
 * The debates on this claim, as rows for the activity feed.
 *
 * Space-scoped like everything else on the page: a debate is published into the space its claim
 * lives in, so the debates worth listing under this space's view of the claim are that space's.
 *
 * Every lookup here is batched across the whole set — profiles in one request, keyframes in two
 * hops for all debates at once — so the cost is flat in the number of rows rather than per row.
 * What is deliberately *not* fetched is anything about a debate's transcript: that waits until the
 * reader expands one.
 */
export function useClaimActivityRows({
  claimId,
  spaceId,
  enabled = true,
}: {
  claimId: string;
  spaceId: string;
  enabled?: boolean;
}): { rows: CommentActivityRow[]; isLoading: boolean } {
  const { entities: debates, isLoading } = useQueryEntities({
    where: {
      types: [{ id: { equals: DEBATE_TYPE_ID } }],
      spaces: [{ equals: spaceId }],
      relations: [{ typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } }, toEntity: { id: { equals: claimId } } }],
    },
    first: ACTIVITY_DEBATE_LIMIT,
    enabled,
  });

  const participantsByDebateId = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const debate of debates) {
      map.set(debate.id, [
        ...relationTargets(debate.relations, DEBATE_SUPPORTED_BY_PROPERTY_ID),
        ...relationTargets(debate.relations, DEBATE_OPPOSED_BY_PROPERTY_ID),
      ]);
    }
    return map;
  }, [debates]);

  // Every debater on the page, and every speaker their extracted claims will be attributed to —
  // the same set, because a claim is extracted from a turn one of them took.
  const participantSpaceIds = React.useMemo(
    () => [...new Set([...participantsByDebateId.values()].flat())],
    [participantsByDebateId]
  );
  const { profilesBySpaceId } = useProfilesBySpaceIds(participantSpaceIds, participantSpaceIds.length > 0);
  const keyframeByDebateId = useDebateKeyframes(debates);

  const rows = React.useMemo(() => {
    if (debates.length === 0) return NO_ROWS;

    return debates.map(debate => ({
      id: debate.id,
      // `createdAt` rather than `updatedAt`: this row's place in the feed is when the debate
      // happened, and `updatedAt` moves whenever anything touches the entity — including a backlink
      // from an unrelated edit, which would float an old debate to the top of the thread.
      createdAt: debateDate(debate)?.toISOString() ?? '',
      content: (
        <DebateActivityRow
          debate={debate}
          spaceId={spaceId}
          profilesBySpaceId={profilesBySpaceId}
          participantSpaceIds={participantsByDebateId.get(debate.id) ?? []}
          keyframeUrl={keyframeByDebateId.get(debate.id) ?? null}
          publishedAt={debateDate(debate)}
        />
      ),
    }));
  }, [debates, keyframeByDebateId, participantsByDebateId, profilesBySpaceId, spaceId]);

  return { rows, isLoading };
}
