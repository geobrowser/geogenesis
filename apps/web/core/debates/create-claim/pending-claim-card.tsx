'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { Text } from '~/design-system/text';

import type { DebateClaimSummary, MatchmakingReadiness } from '../api';
import { MatchmakingClaimCard } from '../matchmaking/matchmaking-claim-card';
import type { PendingDebateClaim } from '~/atoms/debate-create-claim';

/**
 * The optimistic row for a claim the viewer just created inline, shown until the real list has it.
 *
 * It is the ordinary claim card, deliberately — a just-made claim should look like it belongs where
 * it was made — held in a non-interactive "publishing" state. `answersReady={false}` and a
 * `responseBlockedReason` gate the position pills together: taking a position is itself a graph
 * publish geo-chat only learns about after indexing, so the creator (the very person here) must not
 * be able to take one on a claim geo-chat cannot resolve yet and have it rejected as
 * `claim_not_supported`. `hideEndSlot` drops the Request-debate offer for the same window and, as a
 * side effect, disables the match/summary reads the card would otherwise make against an id the
 * graph has never seen.
 */
export function PendingClaimCard({ claim, onDismiss }: { claim: PendingDebateClaim; onDismiss: () => void }) {
  const summary: DebateClaimSummary = {
    id: claim.claimId,
    space_id: claim.spaceId,
    claim_entity_id: claim.claimId,
    claim: claim.text,
    description: null,
  };

  // Stance vocabulary: the claim is created without an `Is factual` value, so its sides read
  // Agree/Disagree — the same default the debates surfaces resolve for it.
  const readiness: MatchmakingReadiness = {
    response_kind: 'stance',
    viewer_response: null,
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
  };

  const blockedReason = claim.status === 'publishing' ? 'Publishing this claim…' : 'Finishing up…';
  const indexed = claim.status === 'indexed';

  return (
    <MatchmakingClaimCard
      claim={summary}
      positions={[]}
      readiness={readiness}
      answersReady={false}
      responseBlockedReason={blockedReason}
      hideEndSlot
      // A no-op opener rather than a link: the entity page has nothing to show until the claim
      // indexes, so a click through to it would land on an empty page.
      onOpenClaim={() => {}}
      footer={
        <div className="mt-3 flex items-center gap-2 border-t border-divider pt-3">
          <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-grey-03" />
          <Text as="span" variant="footnote" color="grey-04" className="min-w-0 flex-1">
            {claim.status === 'publishing'
              ? 'Publishing — this claim will be ready to debate once it’s indexed.'
              : 'Published — finishing up, this claim will be ready to debate shortly.'}
          </Text>
          {indexed ? (
            <SmallButton type="button" variant="secondary" onClick={onDismiss}>
              Dismiss
            </SmallButton>
          ) : null}
        </div>
      }
    />
  );
}
