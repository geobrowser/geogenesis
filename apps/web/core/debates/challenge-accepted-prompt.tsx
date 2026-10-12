'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { Text } from '~/design-system/text';

import type { DebateRematchParticipant, DebateRematchSession } from './api';
import { debateRematchMediaSessionKey } from './media-session';
import { readRematchJoinIntent, rememberRematchJoinIntent } from './rematch-join-intent';
import { DebateRequestMediaPreview } from './request-media-preview';
import { useScrollLock } from './use-scroll-lock';

/**
 * The card the sender of a profile challenge gets when it is accepted.
 */
export function ChallengeAcceptedPrompt({
  session,
  currentUserId,
  busy,
  error,
  onExplore,
  onDecline,
}: {
  session: DebateRematchSession;
  currentUserId: string;
  busy: boolean;
  error: string | null;
  onExplore: () => void;
  onDecline: () => void;
}) {
  const titleId = React.useId();

  const [initialMicOn] = React.useState(() => readRematchJoinIntent(session.id)?.micOn ?? null);
  const rememberMic = React.useCallback(
    (micOn: boolean) => rememberRematchJoinIntent(session.id, { micOn, cameraOn: null }),
    [session.id]
  );
  const you = session.participants.find(participant => participant.user_id === currentUserId) ?? null;
  const other = session.participants.find(participant => participant.user_id !== currentUserId) ?? null;

  useScrollLock();

  if (!you || !other) return null;

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
              {participantName(other)} accepted your request
            </Text>
          </h2>
        </header>

        <div className="grid min-h-24 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-grey-02 bg-white p-3">
          <DebateRequestMediaPreview
            sessionKey={debateRematchMediaSessionKey(session.id)}
            avatarCid={you.avatar_cid}
            avatarValue={you.profile_space_id}
            micOnly
            initialMicOn={initialMicOn}
            onMicChange={rememberMic}
            fallback={<RematchParticipant participant={you} label="You" />}
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
          <RematchParticipant participant={other} label={participantName(other)} />
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
              onClick={onDecline}
              disabled={busy}
              className={DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME}
            >
              Decline
            </button>
            <button type="button" onClick={onExplore} disabled={busy} className={DIALOG_ACTION_BUTTON_CLASS_NAME}>
              Explore claims
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function RematchParticipant({ participant, label }: { participant: DebateRematchParticipant; label: string }) {
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

function participantName(participant: DebateRematchParticipant) {
  return participant.display_name || 'Debater';
}
