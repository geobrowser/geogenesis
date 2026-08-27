'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { type TranscriptClaim, claimsForParticipant, unmatchedClaims } from '~/core/debates/transcript-claims';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useDebateVotes } from '~/core/debates/use-debate-votes';
import {
  ClaimResponseBatchBoundary,
  useClaimResponseSummaryBatch,
} from '~/core/responses/use-claim-response-summaries';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Close } from '~/design-system/icons/close';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { DebateEntityResponseControls } from '../debate-entity-response-controls';
import { WinnerVoteButton } from './winner-vote-button';

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
  const allClaims = claims.all;

  const orphaned = React.useMemo(
    () =>
      unmatchedClaims(
        claims,
        participants.map(participant => participant.profile_space_id)
      ),
    [claims, participants]
  );

  // Every claim a debate publishes lands in the debate's own space, so one batch covers the panel.
  // A claim that somehow lives elsewhere still renders: `EntityVoteButtons` re-resolves the space
  // per entity, so it just misses this prewarm and fetches its own counts.
  const responsesSpaceId = React.useMemo(
    () => allClaims.find(claim => claim.spaceId !== null)?.spaceId ?? debate.claim.space_id,
    [allClaims, debate.claim.space_id]
  );

  // One request for every claim's counts and responders, instead of two per control. Same pairing
  // the space's own Claims page uses.
  const responseTargets = React.useMemo(
    () =>
      allClaims
        .filter(claim => claim.spaceId !== null)
        .map(claim => ({ entityId: claim.id, responseKind: claim.responseKind })),
    [allClaims]
  );
  const responseBatch = useClaimResponseSummaryBatch({
    spaceId: responsesSpaceId,
    targets: responseTargets,
    enabled: responseTargets.length > 0,
  });
  const responseBatchReady = responseTargets.length === 0 || responseBatch.isSuccess;

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
      <ClaimResponseBatchBoundary ready={responseBatchReady}>
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
                claims={claimsForParticipant(claims, participant.profile_space_id)}
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
      </ClaimResponseBatchBoundary>
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

  // `list-disc pl-4` is the app's bulleted list, copied off `.prose-chat ul` in `styles/chat.css`
  // — the editor's own lists land on the same disc-plus-1rem-indent in `styles/tiptap.css`. Both
  // are CSS attached to a container class rather than a component, so there is nothing to import;
  // matching the utilities is the reuse.
  return (
    <ul className="mt-5 list-disc space-y-4 pl-4">
      {claims.map(claim => (
        <li key={claim.id}>
          <ClaimRow claim={claim} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One claim: its text linking to the claim entity, with the viewer's position beneath it.
 *
 * A claim the graph reports no space for is rendered as plain text. Both the link target and the
 * response target are space-scoped, so there is nothing correct to point either one at — better a
 * dead row than one that navigates somewhere wrong or publishes a response into the wrong space.
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
      <div className="mt-2">
        <DebateEntityResponseControls entityId={claim.id} spaceId={claim.spaceId} responseKind={claim.responseKind} />
      </div>
    </>
  );
}
