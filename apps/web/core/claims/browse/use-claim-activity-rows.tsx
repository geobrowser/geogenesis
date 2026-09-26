'use client';

import * as React from 'react';

import { useEntityCommentCounts } from '~/core/comments/use-entity-comment-counts';
import {
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
} from '~/core/debates/ontology';
import { useDebateClaimCounts } from '~/core/debates/use-debate-claim-counts';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { countFor } from '~/core/hooks/batched-counts';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

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
}): {
  rows: CommentActivityRow[];
  isLoading: boolean;
  /**
   * The debates read failed, so `rows` being empty says nothing about this claim.
   *
   * `useQueryEntities` hands this back precisely so a caller drawing an empty state can tell "nothing
   * matched" from "the query never came back" — and this feed is the case that documentation warns
   * about: dropping it meant a cold-load failure silently omitted every debate and every claim
   * extracted from them, while the heading, which is a different query, went on counting them.
   */
  error: Error | null;
  /** Ask again, so a failed fetch is not "no debates" for as long as the page stays open. */
  retry: () => void;
} {
  const {
    entities: debates,
    isLoading,
    error,
    refetch,
  } = useQueryEntities({
    where: {
      types: [{ id: { equals: DEBATE_TYPE_ID } }],
      spaces: [{ equals: spaceId }],
      relations: [{ typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } }, toEntity: { id: { equals: claimId } } }],
    },
    first: ACTIVITY_DEBATE_LIMIT,
    // Newest first, and said explicitly. The limit above promises the *most recent* few, and an
    // unordered bounded query returns whichever page the server likes — so on a claim with more
    // debates than the limit the feed would have shown an arbitrary subset while claiming they were
    // the latest. `ID_ASC` settles ties, so two debates published in the same second do not swap
    // places between reads.
    orderBy: [EntitiesOrderBy.CreatedAtDesc, EntitiesOrderBy.IdAsc],
    enabled,
  });

  // Who argued, and which side they took. The side is what lets an extracted claim carry the same
  // Agree/Disagree tag a comment does — fixed at the debate rather than tracking where the speaker
  // stands today, because what they argued in a recorded debate cannot change afterwards.
  const sidesByDebateId = React.useMemo(() => {
    const map = new Map<string, Array<{ spaceId: string; position: boolean }>>();
    for (const debate of debates) {
      map.set(debate.id, [
        ...relationTargets(debate.relations, DEBATE_SUPPORTED_BY_PROPERTY_ID).map(spaceId => ({
          spaceId,
          position: true,
        })),
        ...relationTargets(debate.relations, DEBATE_OPPOSED_BY_PROPERTY_ID).map(spaceId => ({
          spaceId,
          position: false,
        })),
      ]);
    }
    return map;
  }, [debates]);

  // Every debater on the page, and every speaker their extracted claims will be attributed to —
  // the same set, because a claim is extracted from a turn one of them took.
  const participantSpaceIds = React.useMemo(
    () => [...new Set([...sidesByDebateId.values()].flat().map(side => side.spaceId))],
    [sidesByDebateId]
  );
  const { profilesBySpaceId } = useProfilesBySpaceIds(participantSpaceIds, participantSpaceIds.length > 0);
  const keyframeByDebateId = useDebateKeyframes(debates);

  // Both counts for every debate on the page, in two requests rather than two per row. The rows used
  // to ask for their own — the comment count through a batched hook handed a single id, which is a
  // request each, and the claim count through the debate's transcript, which is the expensive read
  // the collapse control exists to avoid and which ran whether or not the row was expanded.
  const debateIds = React.useMemo(() => debates.map(debate => debate.id), [debates]);
  const commentCountByDebateId = useEntityCommentCounts(debateIds);
  const claimCountByDebateId = useDebateClaimCounts(debateIds);

  const rows = React.useMemo(() => {
    if (debates.length === 0) return NO_ROWS;

    return debates.map(debate => ({
      id: debate.id,
      // The debate entity itself is what the row's upvotes are cast on, in the space the claim page
      // is being read through — which is also where the debate was published.
      entityId: debate.id,
      spaceId,
      // `createdAt` rather than `updatedAt`: this row's place in the feed is when the debate
      // happened, and `updatedAt` moves whenever anything touches the entity — including a backlink
      // from an unrelated edit, which would float an old debate to the top of the thread.
      createdAt: debateDate(debate)?.toISOString() ?? '',
      content: (
        <DebateActivityRow
          debate={debate}
          spaceId={spaceId}
          profilesBySpaceId={profilesBySpaceId}
          sides={sidesByDebateId.get(debate.id) ?? []}
          claimText={debatedClaimText(debate)}
          keyframeUrl={keyframeByDebateId.get(debate.id) ?? null}
          publishedAt={debateDate(debate)}
          // `countFor`, not `?? 0`: a failed aggregate answers `null`, and the row draws its branch
          // on a null rather than reporting the debate as empty. See `batched-counts.ts`.
          commentCount={countFor(commentCountByDebateId, debate.id)}
          claimCount={countFor(claimCountByDebateId, debate.id)}
        />
      ),
    }));
  }, [
    claimCountByDebateId,
    commentCountByDebateId,
    debates,
    keyframeByDebateId,
    profilesBySpaceId,
    sidesByDebateId,
    spaceId,
  ]);

  const retry = React.useCallback(() => void refetch(), [refetch]);

  return { rows, isLoading, error: (error as Error | null) ?? null, retry };
}

/**
 * The claim the debate argued, as text.
 *
 * On this page that is the claim being read, so it is not new information — it is the row's body.
 * A debate row otherwise carries only a byline and a control strip, which beside comments that each
 * have something to say reads as a row that failed to load rather than as a debate.
 *
 * Taken from the debate's own `Claims` relation rather than from the page, so the row still says
 * what it argued anywhere else this component is reused.
 */
function debatedClaimText(debate: Entity): string | null {
  const relation = debate.relations.find(
    candidate => candidate.isDeleted !== true && ID.equals(candidate.type.id, DEBATE_CLAIMS_PROPERTY_ID)
  );
  return relation?.toEntity.name?.trim() || null;
}
