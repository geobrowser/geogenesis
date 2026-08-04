'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { DebateChallenge, DebateParticipantSummary } from './api';

type DebateChallengeDialogProps = {
  challenge: DebateChallenge;
  /** The sender sees a waiting state; only the recipient can accept. */
  role: 'requester' | 'recipient';
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
};

/**
 * The claimless debate request sent from someone's profile. Accepting drops both
 * people into the claim picker to choose one.
 */
export function DebateChallengeDialog({
  challenge,
  role,
  busy,
  error,
  onAccept,
  onReject,
}: DebateChallengeDialogProps) {
  const titleId = React.useId();
  const isRecipient = role === 'recipient';
  const you = isRecipient ? challenge.recipient : challenge.requester;
  const other = isRecipient ? challenge.requester : challenge.recipient;

  React.useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalDocumentOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalDocumentOverflow;
    };
  }, []);

  return (
    <div className="max-sm:items-end max-sm:p-0 fixed inset-0 z-1200 flex items-center justify-center bg-text/45 p-5 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-sm:rounded-b-none max-sm:border-b-0 max-sm:px-4 max-sm:py-5 grid w-[min(370px,100%)] gap-4 overflow-hidden rounded-lg bg-divider p-5 text-text shadow-card"
      >
        <header className="min-w-0 text-center">
          <h2 id={titleId}>
            <Text as="span" variant="metadata" color="text">
              Debate request
            </Text>
          </h2>
        </header>

        <div className="grid h-24 grid-cols-[1fr_auto_1fr] items-center rounded-lg border border-grey-02 bg-white">
          <ChallengeParticipant participant={you} label="You" />
          <div className="relative grid w-7 place-items-center">
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 h-18 w-px -translate-x-1/2 -translate-y-1/2 bg-divider"
            />
            <span className="relative grid h-7 w-7 place-items-center rounded-full border border-divider bg-white text-tag text-text">
              VS
            </span>
          </div>
          <ChallengeParticipant participant={other} label={participantName(other)} />
        </div>

        {error && (
          <Text as="p" variant="body" color="red-01">
            {error}
          </Text>
        )}

        <footer className="grid gap-5">
          {isRecipient ? (
            <button
              type="button"
              onClick={onAccept}
              disabled={busy}
              className="flex h-7 w-full items-center justify-center rounded-full bg-text px-4 text-metadata text-white transition-colors hover:bg-text/90 disabled:opacity-50"
            >
              Explore claims
            </button>
          ) : (
            <Text as="p" variant="body" color="grey-04" className="text-center">
              Waiting for {participantName(other)} to accept...
            </Text>
          )}
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="mx-auto px-4 py-1 text-metadata text-grey-04 hover:text-text disabled:opacity-50"
          >
            {isRecipient ? 'Reject' : 'Cancel'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ChallengeParticipant({ participant, label }: { participant: DebateParticipantSummary; label: string }) {
  return (
    <div className="grid min-w-0 justify-items-center gap-2 text-center">
      <span className="h-5 w-5 overflow-hidden rounded-full">
        <Avatar
          avatarUrl={participant.avatar_cid}
          value={participant.profile_space_id}
          alt={participantName(participant)}
          size={20}
        />
      </span>
      <Text as="div" variant="metadata" color="text" className="max-w-full truncate">
        {label}
      </Text>
    </div>
  );
}

function participantName(participant: DebateParticipantSummary) {
  return participant.display_name || 'Debater';
}
