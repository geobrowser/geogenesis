'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { claimResponseKind } from '~/core/claims/response-kind';
import type { DebateClaim } from '~/core/debates/api';
import { sortClaimsByBest, useClaimsBestOrder } from '~/core/debates/claims-best-order';
import { useDebateClaims } from '~/core/debates/hooks';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { Text } from '~/design-system/text';

import { positionSummariesFromCounts, viewerResponseFromDirection } from './claim-position-summaries';
import { useClaimResponseSummary } from './claim-response-summary';
import { CursorPager, useCursorPages } from './use-cursor-pages';

/**
 * A way out of the page, not a directory — and how many more arrive each time the reader asks.
 *
 * A busy topic can carry hundreds of claims, so the gallery pages rather than capping silently and
 * leaving the section looking like the whole answer.
 */
const RELATED_PAGE_SIZE = 4;

/**
 * Other claims carrying one of this claim's topics, as a gallery of the same cards the debates
 * hub draws.
 *
 * This is where topics finally pay off — as a way out of the page rather than a label on it.
 *
 * Each page is ranked the way the explore page's "Best" sort ranks everything else, over the rows
 * that page holds.
 *
 * Within the page, and not for want of trying. The obvious better shape is to ask the ranked
 * connection itself for topic-filtered claims — it takes `spaceIds`, `typeIds`, a `filter` and a
 * cursor, so on paper it returns the whole topic in Best order with paging built in. Measured
 * against testnet it does not:
 *
 *   * unfiltered, the ranked connection answers in ~0.3s in genuine ranking order
 *   * with a `relations` filter it takes ~17s, and the rows come back in *id* order — the ranking
 *     is not applied once the query leaves the ranking index
 *   * with that filter and `pageInfo` it exceeds the statement timeout outright
 *
 * So a topic-filtered ranked query would be slow, and would not even be Best. `claims-best-order`
 * works because it narrows to a bounded set of ids already in hand, which is a lookup rather than
 * a scan — the distinction its own comment draws. Ranking a whole topic needs the ranking index to
 * cover the filter, which is a server-side change rather than a caller's.
 */
export function ClaimRelatedClaims({
  claimId,
  spaceId,
  topicIds,
}: {
  claimId: string;
  spaceId: string;
  topicIds: string[];
}) {
  // A page at a time rather than an accumulating gallery: appending pushes everything below down
  // the page as the reader loads more, where swapping keeps the layout where they left it.
  //
  // `hasNextPage` is the server's own answer, which matters more here than in the debates list:
  // this claim is filtered out of its own results below, so counting rows to infer a further page
  // would be off by one exactly on the page that contains it.
  const pages = useCursorPages();
  const {
    entities: page,
    isLoading,
    isPlaceholderData,
    endCursor,
    hasNextPage,
  } = useQueryEntities({
    where: {
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      spaces: [{ equals: spaceId }],
      relations: [{ typeOf: { id: { equals: TOPICS_PROPERTY_ID } }, toEntity: { id: { in: topicIds } } }],
    },
    first: RELATED_PAGE_SIZE,
    after: pages.cursor,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    // Holds the page being read while the next one loads, so stepping through doesn't blink the
    // gallery out and collapse the layout the pager exists to keep still.
    placeholderData: keepPreviousData,
    enabled: topicIds.length > 0,
  });

  const candidates = React.useMemo(
    () => page.filter(entity => !ID.equals(entity.id, claimId) && entity.name),
    [claimId, page]
  );

  const candidateIds = React.useMemo(() => candidates.map(entity => entity.id), [candidates]);
  const { rankByClaimId, isReady: isRankReady } = useClaimsBestOrder(candidateIds, spaceId);
  // Claims the ranking hasn't scored keep their server order behind the ranked ones, so a topic the
  // feed has barely touched still reads in a sensible sequence rather than arbitrarily.
  const ordered = React.useMemo(() => sortClaimsByBest(candidates, rankByClaimId), [candidates, rankByClaimId]);

  // A page is only committed to the screen once its ranking is known. The rows and the ranking are
  // two requests, and rendering on the first meant a page appeared in the server's order and then
  // resequenced under the reader when the second landed. Holding the previous page until the new
  // one can be drawn in its final order costs a moment on Next and never reorders anything.
  const [related, setRelated] = React.useState<Entity[]>([]);
  React.useEffect(() => {
    if (!isRankReady) return;
    setRelated(current => (sameOrder(current, ordered) ? current : ordered));
  }, [isRankReady, ordered]);

  // The page holding this claim shows one card fewer, and a topic with only this claim on its first
  // page would show none at all. Skip forward rather than render an empty gallery on a topic that
  // does have neighbours further down — only from the first page, since past that the reader
  // navigated here and needs the pager to get back.
  //
  // Destructured rather than depending on `pages`: the hook returns a fresh object each render, so
  // naming it as a dependency would re-run this on every render. `toNext` is stable for a given
  // page, which is the granularity that matters.
  //
  // Keyed on `candidates` rather than the committed list: this asks whether the page that just
  // arrived has anything to show, which the committed list — still holding the previous page —
  // cannot answer.
  const { isFirstPage, toNext } = pages;
  React.useEffect(() => {
    if (!isFirstPage || isLoading || candidates.length > 0 || !hasNextPage || !endCursor) return;
    toNext(endCursor);
  }, [candidates.length, endCursor, hasNextPage, isFirstPage, isLoading, toNext]);

  // One lookup for the whole gallery. The cards read their sides and readiness from geo-chat, the
  // same as they do in the hub — without it every card would draw an empty, un-actionable pair.
  const relatedIds = React.useMemo(() => related.map(entity => entity.id), [related]);
  const rowsQuery = useDebateClaims(spaceId, relatedIds, relatedIds.length > 0);
  const rowsByClaimId = React.useMemo(() => {
    const map = new Map<string, DebateClaim>();
    for (const row of rowsQuery.data?.claims ?? []) map.set(row.claim_entity_id, row);
    return map;
  }, [rowsQuery.data?.claims]);

  // Nothing to show and nothing left to fetch. While a further page exists the effect above is
  // still walking toward it, and hiding now would flash the section out and back in. Past the
  // first page an empty one keeps its pager, so the reader can step back.
  if (related.length === 0 && pages.isFirstPage) return null;

  return (
    <section aria-label="Related claims">
      <Text as="h2" variant="smallTitle" color="text" className="mb-3 block">
        Related claims
      </Text>
      {/* Two up where there is room, one up in the side panel and on a phone — the same container
          query the rest of the page lays out against, so the gallery follows the panel's width
          rather than the window's. */}
      <div className="grid grid-cols-1 gap-3 @[560px]:grid-cols-2">
        {related.map(entity => (
          <RelatedClaimCard
            key={entity.id}
            entity={entity}
            spaceId={spaceId}
            row={rowsByClaimId.get(entity.id) ?? null}
          />
        ))}
      </div>
      <CursorPager
        isFirstPage={pages.isFirstPage}
        hasNextPage={hasNextPage}
        // Three states where the cursor and what is on screen disagree, and stepping would land
        // somewhere the reader never saw:
        //
        //   isLoading          — no page yet
        //   isPlaceholderData  — previous page still shown, its `endCursor` now stale
        //   !isRankReady       — new page fetched but deliberately not committed until ranked, so
        //                        the cursor has already advanced past the page being looked at
        //
        // The last is specific to this section: the entity query has moved on while `related` is
        // still holding the previous page, so Next would skip the page in between entirely.
        isLoading={isLoading || isPlaceholderData || !isRankReady}
        onPrevious={pages.toPrevious}
        onNext={() => endCursor && pages.toNext(endCursor)}
      />
    </section>
  );
}

/** Whether two pages hold the same claims in the same sequence, so state isn't replaced needlessly. */
function sameOrder(left: Entity[], right: Entity[]) {
  return left.length === right.length && left.every((entity, index) => entity.id === right[index]?.id);
}

function RelatedClaimCard({
  entity,
  spaceId,
  row,
}: {
  entity: Entity;
  spaceId: string;
  row: DebateClaim | null;
  /** The gallery's single lookup settles for every card at once, so this is the honest per-card
   * answer to "is there no row, or has it not arrived yet". */
}) {
  // geo-chat only has a row once someone has taken a side, so the response kind falls back to what
  // the claim's own "Is factual" value implies — the same fallback the hub's Featured list uses.
  const responseKind = row?.response_kind ?? claimResponseKind(entity, spaceId);
  const summary = useClaimResponseSummary(entity.id, spaceId, responseKind);

  const positions = React.useMemo(
    () => positionSummariesFromCounts(summary.positive, summary.negative, responseKind, row),
    [responseKind, row, summary.negative, summary.positive]
  );

  const viewerResponse = React.useMemo(
    () => viewerResponseFromDirection(summary.viewerDirection, responseKind),
    [responseKind, summary.viewerDirection]
  );

  return (
    <MatchmakingClaimCard
      claim={{
        id: row?.id ?? entity.id,
        space_id: spaceId,
        claim_entity_id: entity.id,
        claim: entity.name ?? entity.id,
        description: entity.description,
      }}
      positions={positions}
      readiness={{
        response_kind: responseKind,
        // Falls back to the on-chain summary, which resolves independently of geo-chat's batch.
        // Treating an unarrived row as "no response" drew the viewer's own side unselected, and a
        // click on it republished the response they already held instead of clearing it.
        viewer_response: row?.viewer_response ?? viewerResponse,
        viewer_debate_ready: row?.viewer_debate_ready ?? false,
        readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
      }}
      activeDebate={row?.active_debate ?? null}
    />
  );
}

