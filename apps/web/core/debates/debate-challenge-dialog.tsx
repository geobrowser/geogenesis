'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { Text } from '~/design-system/text';

import type { DebateChallenge, DebateParticipantSummary } from './api';
import { debateChallengeMediaSessionKey } from './media-session';
import { DebateRequestMediaPreview } from './request-media-preview';
import { useScrollLock } from './use-scroll-lock';

type DebateChallengeDialogProps = {
  challenge: DebateChallenge;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  /** Rejects the challenge for good. */
  onReject: () => void;
  /** Closes this popup and nothing else. The challenge stays live in the hub's Requests tab. */
  onNotNow: () => void;
};

/**
 * The claimless debate request sent from someone's profile, shown to the person it was sent to.
 * Accepting drops both people into the claim picker to choose one.
 *
 * Only the recipient is interrupted: the sender has nothing to decide, so their challenge waits
 * in the hub's Requests tab under Sent rather than behind a modal.
 *
 * Turning it down and putting it off are deliberately separate: a challenge lives until it
 * expires, so "Not now" only closes this popup, and rejecting is the text action underneath.
 */
export function DebateChallengeDialog({
  challenge,
  busy,
  error,
  onAccept,
  onReject,
  onNotNow,
}: DebateChallengeDialogProps) {
  const titleId = React.useId();
  const you = challenge.recipient;
  const other = challenge.requester;

  useScrollLock();

  /*
   * Deliberately no hand-off here, unlike `DebateRequestDialog`.
   *
   * Accepting a challenge does not lead to a room: it drops both people into the claim picker,
   * which has no media surface of its own — it reads this session only to choose devices, and opens
   * its own `getUserMedia` for voice. Nothing calls `beginSession` on that route, so devices held
   * open here would stay open, unowned and with nothing on screen to explain the camera light,
   * until the debate room finally claims the session and stops them.
   *
   * So this card always releases on the way out, and what cannot be obtained later without
   * interrupting a call — the permission itself — stays granted for the pre-join screen to use.
   */
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

        <div className="grid min-h-24 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-grey-02 bg-white p-3">
          <DebateRequestMediaPreview
            sessionKey={debateChallengeMediaSessionKey(challenge.id)}
            avatarCid={you.avatar_cid}
            avatarValue={you.profile_space_id}
            fallback={<ChallengeParticipant participant={you} label="You" />}
          />
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
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onNotNow}
              disabled={busy}
              className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}
            >
              Not now
            </button>
            <button type="button" onClick={onAccept} disabled={busy} className={DIALOG_ACTION_BUTTON_CLASS_NAME}>
              Explore claims
            </button>
          </div>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="mx-auto -mt-3 px-4 py-1 text-metadata text-grey-04 underline hover:text-text disabled:opacity-50"
          >
            Reject request
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
