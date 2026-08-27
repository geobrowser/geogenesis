'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { sortClaimsByBest, useClaimsBestOrder } from '~/core/debates/claims-best-order';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { type TranscriptClaim, claimsForParticipant, unmatchedClaims } from '~/core/debates/transcript-claims';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useDebateVotes } from '~/core/debates/use-debate-votes';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Close } from '~/design-system/icons/close';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { EntityRowActions } from '~/partials/entity-page/entity-row-actions';

import { WinnerVoteButton } from './winner-vote-button';

/** How many of a debater's claims show before "Show more". */
const COLLAPSED_CLAIM_COUNT = 3;

/**
 * "Claims" side panel opened from the browse feed's Claims button. Groups the claims extracted
 * from the debate's transcript by the debater who made them.
 *
 * Attribution comes from the *text block's* `Authors` relation rather than the claim's, and that
 * relation points at the speaker's personal space — the same `profile_space_id` these rows already
 * key on. See `core/debates/transcript-claims.ts`.
 */
export function DebateClaimsPanel({ debate, onClose }: { debate: Debate; onClose: () => void }) {
  const participants = orderedParticipants(debate);
  // Same query key as the player's hook, so voting in either place updates both.
  const votes = useDebateVotes(debate);
  // Same query key as the feed's count badge, so opening the panel doesn't refetch.
  const { claims, isLoading, error } = useDebateTranscriptClaims(debate.id);

  // Every claim a debate publishes lands in the debate's own space, so one lookup covers the panel.
  const claimsSpaceId = React.useMemo(
    () => claims.all.find(claim => claim.spaceId !== null)?.spaceId ?? debate.claim.space_id,
    [claims.all, debate.claim.space_id]
  );
  const claimIds = React.useMemo(() => claims.all.map(claim => claim.id), [claims.all]);
  const { rankByClaimId } = useClaimsBestOrder(claimIds, claimsSpaceId);

  const orphaned = React.useMemo(
    () =>
      sortClaimsByBest(
        unmatchedClaims(
          claims,
          participants.map(participant => participant.profile_space_id)
        ),
        rankByClaimId
      ),
    [claims, participants, rankByClaimId]
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-divider bg-white md:w-full">
      <header className="flex items-center justify-between px-5 py-4">
        <Text as="h2" variant="cardEntityTitle" color="text">
          Claims · {claims.totalCount}
        </Text>
        <button type="button" aria-label="Close" onClick={onClose} className="text-grey-04 hover:text-text">
          <Close />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-6">
        {participants.map(participant => (
          <article key={participant.user_id} className="rounded-lg border border-grey-02 bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="block size-10 shrink-0 overflow-hidden rounded-full bg-grey-02">
                <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={40} />
              </span>
              <Text as="span" variant="smallTitle" color="text">
                {speakerLabel(participant)}
              </Text>
              <WinnerVoteButton
                className="ml-auto"
                surface="panel"
                debaterName={speakerLabel(participant)}
                sharePercent={votes.sharePercentFor(participant)}
                isMyPick={votes.isMyPick(participant)}
                disabled={votes.isVoting}
                onVote={() => votes.castVote(participant)}
              />
            </div>
            <ClaimList
              claims={sortClaimsByBest(claimsForParticipant(claims, participant.profile_space_id), rankByClaimId)}
              isLoading={isLoading}
              error={error}
            />
          </article>
        ))}
        {/* Attribution comes from the graph and the participant list from geo-chat, so the two can
            disagree. Surfacing the leftovers beats a list that silently reads as complete. */}
        {orphaned.length > 0 && (
          <article className="rounded-lg border border-grey-02 bg-white p-5">
            <Text as="span" variant="smallTitle" color="text">
              Other claims
            </Text>
            <ClaimList claims={orphaned} isLoading={false} error={null} />
          </article>
        )}
      </div>
    </aside>
  );
}

function ClaimList({
  claims,
  isLoading,
  error,
}: {
  claims: TranscriptClaim[];
  isLoading: boolean;
  error: Error | null;
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (claims.length === 0) {
    // A debate recorded before claim extraction shipped has a transcript but no claims, which is
    // indistinguishable here from a speaker who simply made none — so the copy covers both.
    const message = isLoading
      ? 'Loading claims…'
      : error
        ? `Could not load claims: ${error.message}`
        : 'No claims from this debater.';

    return (
      <Text as="p" variant="metadata" color="grey-04" className="mt-5">
        {message}
      </Text>
    );
  }

  const hidden = claims.length - COLLAPSED_CLAIM_COUNT;
  const visible = expanded ? claims : claims.slice(0, COLLAPSED_CLAIM_COUNT);

  return (
    <>
      <ul className="mt-5 space-y-4">
        {visible.map(claim => (
          <li key={claim.id}>
            <ClaimRow claim={claim} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(current => !current)}
          className="mt-4 text-metadata text-grey-04 transition-colors hover:text-text"
        >
          {expanded ? 'Show less' : `Show ${hidden} more`}
        </button>
      )}
    </>
  );
}

/**
 * One claim: its text linking to the claim entity, with the row's actions beneath it.
 *
 * `EntityRowActions` is what a data block's bulleted-list row renders, and it is the whole set —
 * the response control *and* the Debate toggle. Reaching past it for the response control alone
 * (which this did) is what left the toggle off these rows. It also resolves the response kind from
 * the entity itself, so a factual claim gets Verify/Dispute here the same way it does everywhere
 * else, including while a change to that flag is still an unpublished edit.
 *
 * A claim the graph reports no space for is rendered as plain text. Both the link target and the
 * actions are space-scoped, so there is nothing correct to point either one at — better a dead row
 * than one that navigates somewhere wrong or publishes a response into the wrong space.
 */
function ClaimRow({ claim }: { claim: TranscriptClaim }) {
  if (claim.spaceId === null) {
    return (
      <Text as="p" variant="metadata" color="text">
        {claim.text}
      </Text>
    );
  }

  return (
    <>
      <Link href={NavUtils.toEntity(claim.spaceId, claim.id)} className="block hover:underline">
        <Text as="span" variant="metadata" color="text">
          {claim.text}
        </Text>
      </Link>
      {/* Beneath the claim rather than beside it, the way the list, gallery and bulleted-list
          data block rows lay their actions out. */}
      <div className="mt-1">
        <EntityRowActions entityId={claim.id} spaceId={claim.spaceId} />
      </div>
    </>
  );
}
