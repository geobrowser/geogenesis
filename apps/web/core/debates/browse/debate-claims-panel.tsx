'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { useDebateVotes } from '~/core/debates/use-debate-votes';

import { Avatar } from '~/design-system/avatar';
import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { WinnerVoteButton } from './winner-vote-button';

/**
 * "Claims" side panel opened from the browse feed's Claims button. Groups the
 * debate's claims by debater; the per-claim content is a placeholder until
 * claims are wired up.
 */
export function DebateClaimsPanel({ debate, count, onClose }: { debate: Debate; count: number; onClose: () => void }) {
  const participants = orderedParticipants(debate);
  // Same query key as the player's hook, so voting in either place updates both.
  const votes = useDebateVotes(debate);

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
          Claims · {count}
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
            <Text as="p" variant="metadata" color="grey-04" className="mt-5">
              Claims from this debate appear here.
            </Text>
          </article>
        ))}
      </div>
    </aside>
  );
}
