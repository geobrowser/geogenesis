'use client';

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

/** A way out of the page, not a directory. */
const MAX_RELATED = 4;

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
  const { entities } = useQueryEntities({
    where: {
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      spaces: [{ equals: spaceId }],
      relations: [{ typeOf: { id: { equals: TOPICS_PROPERTY_ID } }, toEntity: { id: { in: topicIds } } }],
    },
    // One over the cap, so dropping this claim from its own list can't leave a short one.
    first: MAX_RELATED + 1,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: topicIds.length > 0,
  });

  const related = React.useMemo(
    () => entities.filter(entity => !ID.equals(entity.id, claimId) && entity.name).slice(0, MAX_RELATED),
    [claimId, entities]
  );

  // One lookup for the whole gallery. The cards read their sides and readiness from geo-chat, the
  // same as they do in the hub — without it every card would draw an empty, un-actionable pair.
  const relatedIds = React.useMemo(() => related.map(entity => entity.id), [related]);
  const rowsQuery = useDebateClaims(spaceId, relatedIds, relatedIds.length > 0);
  const rowsByClaimId = React.useMemo(() => {
    const map = new Map<string, DebateClaim>();
    for (const row of rowsQuery.data?.claims ?? []) map.set(row.claim_entity_id, row);
    return map;
  }, [rowsQuery.data?.claims]);

  if (related.length === 0) return null;

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
 * The share of responses that took the positive side, under the card.
 *
 * Absent below the response floor, for the reason the page's own verdict is: a percentage off a
 * handful of responses describes who happened to show up rather than the claim.
 */
function AgreePercent({
  summary,
  responseKind,
}: {
  summary: ReturnType<typeof useClaimResponseSummary>;
  responseKind: 'stance' | 'veracity';
}) {
  if (summary.percent === null) return null;

  return (
    <div className="mt-2 flex items-center gap-2 border-t border-divider pt-2">
      <Text as="span" variant="metadataMedium" color="text" className="tabular-nums">
        {summary.percent}% {ENTITY_RESPONSE_COPY[responseKind].positiveAction.toLowerCase()}
      </Text>
      {summary.isControversial && (
        <span className="rounded-sm bg-orange/25 px-1.5 py-0.5 text-metadata font-medium text-text">Controversial</span>
      )}
    </div>
  );
}
