'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { type TranscriptClaim, claimsForParticipant, unmatchedClaims } from '~/core/debates/transcript-claims';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useDebateVotes } from '~/core/debates/use-debate-votes';

import { Avatar } from '~/design-system/avatar';
import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

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

  const orphaned = React.useMemo(
    () =>
      unmatchedClaims(
        claims,
        participants.map(participant => participant.profile_space_id)
      ),
    [claims, participants]
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

  return (
    <ul className="mt-5 space-y-3">
      {claims.map(claim => (
        <li key={claim.id}>
          <Text as="p" variant="metadata" color="text">
            {claim.text}
          </Text>
        </li>
      ))}
    </ul>
  );
}
