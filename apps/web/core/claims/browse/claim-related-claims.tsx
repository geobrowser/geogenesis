'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { claimResponseKind } from '~/core/claims/response-kind';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { Text } from '~/design-system/text';

import { positionSummariesFromCounts } from './claim-position-summaries';
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
 * Ordered by recency for now. The explore page's "Best" ranking is the order this wants, but the
 * helper that exposes it for a bounded set of claim ids lands with the debate claims panel work;
 * this should adopt it once that is on master rather than growing a second copy of the query.
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

  const related = React.useMemo(
    () => page.filter(entity => !ID.equals(entity.id, claimId) && entity.name),
    [claimId, page]
  );

  // The page holding this claim shows one card fewer, and a topic with only this claim on its first
  // page would show none at all. Skip forward rather than render an empty gallery on a topic that
  // does have neighbours further down — only from the first page, since past that the reader
  // navigated here and needs the pager to get back.
  //
  // Destructured rather than depending on `pages`: the hook returns a fresh object each render, so
  // naming it as a dependency would re-run this on every render. `toNext` is stable for a given
  // page, which is the granularity that matters.
  const { isFirstPage, toNext } = pages;
  React.useEffect(() => {
    if (!isFirstPage || isLoading || related.length > 0 || !hasNextPage || !endCursor) return;
    toNext(endCursor);
  }, [endCursor, hasNextPage, isFirstPage, isLoading, related.length, toNext]);

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
            rowsPending={rowsQuery.isLoading}
          />
        ))}
      </div>
      <CursorPager
        isFirstPage={pages.isFirstPage}
        hasNextPage={hasNextPage}
        isLoading={isLoading}
        onPrevious={pages.toPrevious}
        onNext={() => endCursor && pages.toNext(endCursor)}
      />
    </section>
  );
}

function RelatedClaimCard({
  entity,
  spaceId,
  row,
  rowsPending,
}: {
  entity: Entity;
  spaceId: string;
  row: DebateClaim | null;
  /** The gallery's single lookup settles for every card at once, so this is the honest per-card
   * answer to "is there no row, or has it not arrived yet". */
  rowsPending: boolean;
}) {
  // geo-chat only has a row once someone has taken a side, so the response kind falls back to what
  // the claim's own "Is factual" value implies — the same fallback the hub's Featured list uses.
  const responseKind = row?.response_kind ?? claimResponseKind(entity, spaceId);
  const summary = useClaimResponseSummary(entity.id, spaceId, responseKind);

  const positions = React.useMemo(
    () => positionSummariesFromCounts(summary.positive, summary.negative, responseKind, row),
    [responseKind, row, summary.negative, summary.positive]
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
        viewer_response: row?.viewer_response ?? null,
        viewer_debate_ready: row?.viewer_debate_ready ?? false,
        readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
      }}
      activeDebate={Boolean(row?.active_debate)}
      // The readiness switch reads `viewer_debate_ready`, which is false until geo-chat's lookup
      // lands — drawing it before then would report "not ready" on a claim the viewer is ready on.
      hideReadinessToggle={row === null && rowsPending}
      footer={<AgreePercent summary={summary} responseKind={responseKind} />}
    />
  );
}

/**
 * The split on a related claim, as a miniature of the page's own verdict.
 *
 * A bare "0% agree" line under the pills read as a stray label — the number had no scale behind it
 * and sat at the same weight as everything else on the card. Reusing the verdict's split bar at a
 * smaller size gives it that scale and ties the gallery to the module above it.
 *
 * Present from the first response — absent only on a claim nobody has answered, where there is no
 * split to report.
 */
function AgreePercent({
  summary,
  responseKind,
}: {
  summary: ReturnType<typeof useClaimResponseSummary>;
  responseKind: 'stance' | 'veracity';
}) {
  if (summary.percent === null) return null;

  const copy = ENTITY_RESPONSE_COPY[responseKind];
  const percent = summary.percent;

  return (
    <div className="mt-3 border-t border-divider pt-3">
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-grey-01"
        role="img"
        aria-label={`${percent}% ${copy.positiveAction.toLowerCase()}, ${100 - percent}% ${copy.negativeAction.toLowerCase()}`}
      >
        <span className="bg-green" style={{ width: `${percent}%` }} />
        <span className="bg-red-01" style={{ width: `${100 - percent}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
          <span className="text-text">{percent}%</span> {copy.positiveAction.toLowerCase()}
        </Text>
        {summary.isControversial ? (
          <span className="rounded-sm bg-orange/25 px-1.5 py-0.5 text-metadata font-medium text-text">
            Controversial
          </span>
        ) : (
          <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
            {summary.total} {summary.total === 1 ? 'response' : 'responses'}
          </Text>
        )}
      </div>
    </div>
  );
}
