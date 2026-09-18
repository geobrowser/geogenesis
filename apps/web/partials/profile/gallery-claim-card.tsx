'use client';

import * as React from 'react';

import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import type { ClaimResponse } from '~/core/profile/person-position-order';
import { useQueryEntity } from '~/core/sync/use-store';

import { Skeleton } from '~/design-system/skeleton';

import { ClaimResponseTag } from './claim-response-tag';

/**
 * A claim in the profile's Activity gallery, drawn as the debates panel draws it
 * (GEO-2859).
 *
 * `MatchmakingClaimCard` is the lobby's card — claim, two response pills with
 * their avatar stacks, the share bar, and the offer to request a debate. Using
 * it here rather than the explore feed's card is the point: a claim should look
 * the same wherever it is answered, and the explore card is built to be read
 * one to a row at full width, so in a 420px gallery column its padding and its
 * separate tally block read as a card with something wrong with it.
 *
 * The wiring is `ClaimExploreFeedCard`'s, because that card already turns a feed
 * row into exactly the three things the lobby card wants — `claim`, `positions`
 * and `readiness` all come out of `useClaimResponseState`. Only the body below
 * differs.
 */
export function GalleryClaimCard({ row, response }: { row: ExploreFeedRow; response?: ClaimResponse }) {
  // Gated on proximity, as the feed's card is: a gallery mounts six of these and
  // a horizontal row puts several off to the side, so the geo-chat and graph
  // reads wait until one is actually near. Sticky — once fetched, stay fetched.
  const { ref: setContainer, nearViewport } = useNearViewport();

  const { entity } = useQueryEntity({ id: row.entityId, spaceId: row.spaceId, enabled: nearViewport });

  const rowQuery = useDebateClaims(row.spaceId, [row.entityId], nearViewport);
  const claimRow: DebateClaim | null =
    rowQuery.data?.claims.find(claim => claim.claim_entity_id === row.entityId) ?? null;

  const {
    isResponseKindResolved,
    isViewerResponseResolved,
    responseBlockedReason,
    responseKind,
    claim,
    positions,
    readiness,
  } = useClaimResponseState({
    claimId: row.entityId,
    spaceId: row.spaceId,
    row: claimRow,
    entity,
    title: row.title,
    enabled: nearViewport,
  });

  // A signed-out visitor gets the sign-in prompt rather than two dead pills —
  // the same hook the feed's card and the claim page use, which also keeps
  // Privy's session restoration from being mistaken for a login somebody asked
  // for.
  const promptSignIn = usePrivySignIn();

  return (
    <div ref={setContainer}>
      {claim ? (
        <MatchmakingClaimCard
          claim={claim}
          positions={positions}
          readiness={readiness}
          // Both have to have landed before a press means what it looks like it
          // means: the vocabulary, or a press publishes a stance against a claim
          // that wants Verify/Dispute — and the viewer's own side, or the side
          // they hold is drawn unselected and pressing it republishes instead of
          // clearing.
          answersReady={isResponseKindResolved && isViewerResponseResolved}
          responseBlockedReason={responseBlockedReason}
          onRequireSignIn={promptSignIn}
          // Which side *this person* took — the thing you opened their profile
          // to find out, and not something the card says on its own, since its
          // pills speak for the viewer. In the card's own footer rather than
          // above it: a badge in the row's flow pushed every card carrying one
          // out of line with every card that did not.
          // Held back until the kind is known: labelling a factual claim
          // "agreed" and then correcting it to "verified" is worse than a beat
          // with no tag.
          footer={
            isResponseKindResolved ? (
              <div className="px-3 pb-3">
                <ClaimResponseTag response={response} responseKind={responseKind} />
              </div>
            ) : undefined
          }
        />
      ) : (
        // Held at the card's own height rather than collapsed, so the row does
        // not resize under a reader while the off-screen cards arrive.
        <Skeleton className="h-[164px] w-full rounded-lg" />
      )}
    </div>
  );
}
