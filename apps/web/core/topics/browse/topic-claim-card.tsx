'use client';

import * as React from 'react';

import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import type { Entity } from '~/core/types';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

/**
 * One claim on a topic page, drawn as the card every other claim surface draws.
 *
 * The split used to be passed down as a `footer` from here. It isn't any more: the card reports its
 * own responses through `ClaimSummary`, so the topic page, the hub and the explore feed cannot show
 * the same claim two different ways.
 *
 * `ClaimSummary` draws the share and its bar from the first response onward, two votes included —
 * an earlier revision of this comment claimed it withheld the percentage on a small sample, which
 * was true of a design that got reversed. What the response floor still governs is the
 * **Controversial** band, which is the one reading that genuinely needs a population behind it.
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

  const state = useClaimResponseState({
    claimId: claim.id,
    spaceId,
    row,
    entity: claim,
    title: claim.name ?? claim.id,
    description: claim.description,
  });

  return (
    <MatchmakingClaimCard
      claim={state.claim}
      positions={state.positions}
      readiness={state.readiness}
      activeDebate={row?.active_debate ?? null}
    />
  );
}
