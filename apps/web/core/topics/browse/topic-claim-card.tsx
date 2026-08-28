'use client';

import * as React from 'react';

import {
  positionSummariesFromCounts,
  viewerResponseFromDirection,
} from '~/core/claims/browse/claim-position-summaries';
import { useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { claimResponseKind } from '~/core/claims/response-kind';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import type { Entity } from '~/core/types';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

import { Text } from '~/design-system/text';

/**
 * One claim on a topic page, drawn as the hub's card with its split beneath.
 *
 * Space-scoped to the claim's own space rather than the route's. A topic aggregates across spaces,
 * so the space in the URL is often not one this claim lives in — reading its responses against that
 * space would report a population of zero, which is the failure the claim page's own scoping note
 * describes from the other direction.
 *
 * Resolved with `resolveEntitySpaceId` rather than by taking `spaces[0]`. That list counts every
 * space holding a relation authored from the claim, and is rank-sorted, so its first entry is
 * whichever *citing* space ranks highest — a space the claim may hold no content in at all. This
 * id does more than scope a read: it is the `space_id` the card publishes a response to.
 *
 * The geo-chat row is fetched per card rather than batched for the section: the batch endpoint takes
 * a single space, and these claims can come from as many spaces as the page has cards.
 */
export function TopicClaimCard({ claim, fallbackSpaceId }: { claim: Entity; fallbackSpaceId: string }) {
  const spaceId = resolveEntitySpaceId(claim, fallbackSpaceId);

  const rowQuery = useDebateClaims(spaceId, [claim.id], true);
  const row: DebateClaim | null = rowQuery.data?.claims.find(entry => entry.claim_entity_id === claim.id) ?? null;

  // One effective kind for the card, geo-chat's where it has a row. Deriving it twice is what let
  // the claim page count one vote kind while publishing another.
  const responseKind = row?.response_kind ?? claimResponseKind(claim, spaceId);
  const summary = useClaimResponseSummary(claim.id, spaceId, responseKind);

  const positions = React.useMemo(
    () => positionSummariesFromCounts(summary.positive, summary.negative, responseKind, row),
    [responseKind, row, summary.negative, summary.positive]
  );

  return (
    <MatchmakingClaimCard
      claim={{
        id: row?.id ?? claim.id,
        space_id: spaceId,
        claim_entity_id: claim.id,
        claim: claim.name ?? claim.id,
        description: claim.description,
      }}
      positions={positions}
      readiness={{
        response_kind: responseKind,
        // The on-chain summary resolves independently of geo-chat, so an unarrived row is not read
        // as "no response" — which would draw the viewer's own side unselected and turn a click on
        // it into a republish rather than a clear.
        viewer_response: row?.viewer_response ?? viewerResponseFromDirection(summary.viewerDirection, responseKind),
        viewer_debate_ready: row?.viewer_debate_ready ?? false,
        readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
      }}
      activeDebate={Boolean(row?.active_debate)}
      hideReadinessToggle={row === null && rowQuery.isLoading}
      footer={<ClaimSplit summary={summary} responseKind={responseKind} />}
    />
  );
}

/** The split under the card, a miniature of the claim page's verdict. */
function ClaimSplit({
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
