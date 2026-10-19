'use client';

import * as React from 'react';

import { useFeatureFlag } from '~/core/state/feature-flags';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { Text } from '~/design-system/text';

import type { DebateRematchParticipant, DebateRematchSession } from './api';
import { debateRematchMediaSessionKey } from './media-session';
import { readRematchJoinIntent, rememberRematchJoinIntent } from './rematch-join-intent';
import type { DebateJoinState } from './request-join-state';
import { DebateRequestMediaPreview } from './request-media-preview';
import { RequestParticipantTile } from './request-participant-tile';
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
  const descriptionId = React.useId();

  const [initialJoinState] = React.useState(() => {
    const remembered = readRematchJoinIntent(session.id);
    return remembered ? { micOn: remembered.micOn, cameraOn: remembered.cameraOn ?? false } : null;
  });

  const you = session.participants.find(participant => participant.user_id === currentUserId) ?? null;
  const other = session.participants.find(participant => participant.user_id !== currentUserId) ?? null;

  useScrollLock();
  // Leads into the claim picker, which is audio-only without the flag: no camera choice to carry.
  const videoEnabled = useFeatureFlag('debateVideo');
  const rememberChoice = React.useCallback(
    (state: { micOn: boolean; cameraOn: boolean }) =>
      rememberRematchJoinIntent(
        session.id,
        videoEnabled ? { ...state, source: 'card' } : { micOn: state.micOn, source: 'card' }
      ),
    [session.id, videoEnabled]
  );

  if (!you || !other) return null;

  return (
    <div className="max-sm:items-end max-sm:p-0 fixed inset-0 z-1200 flex items-center justify-center bg-text/45 p-5 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-sm:rounded-b-none max-sm:border-b-0 max-sm:px-4 max-sm:py-5 grid w-[min(444px,100%)] gap-4 overflow-hidden rounded-lg bg-divider p-5 text-text shadow-card"
      >
        <header className="grid min-w-0 gap-1 text-center">
          <h2 id={titleId}>
            <Text as="span" variant="metadata" color="text" className="font-semibold">
              {participantName(other)} accepted your request
            </Text>
          </h2>
          <p id={descriptionId} className="text-[14px] leading-5 text-grey-04">
            Join a live room together and pick a claim to debate.
          </p>
        </header>

        <DebateRequestMediaPreview
          sessionKey={debateRematchMediaSessionKey(session.id)}
          avatarCid={you.avatar_cid}
          avatarValue={you.profile_space_id}
          initialJoinState={initialJoinState}
          onJoinStateChange={rememberChoice}
          camera={videoEnabled}
          appearance="tile"
          formatSummary={state => describeAcceptedJoin(state, participantName(other), videoEnabled)}
          fallback={
            <RequestParticipantTile label="You" local avatarCid={you.avatar_cid} avatarValue={you.profile_space_id} />
          }
          renderLayout={(preview, status) => (
            <div className="grid gap-2">
              <div className="relative grid grid-cols-2 items-center gap-2">
                {preview}
                <RequestParticipantTile
                  label={participantName(other)}
                  avatarCid={other.avatar_cid}
                  avatarValue={other.profile_space_id}
                />
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 left-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-text text-tag text-white ring-3 ring-divider"
                >
                  VS
                </span>
              </div>
              {status && <div className="grid gap-1 text-center">{status}</div>}
            </div>
          )}
        />

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
              className={`${DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME} h-11!`}
            >
              Decline
            </button>
            <button
              type="button"
              onClick={onExplore}
              disabled={busy}
              className={`${DIALOG_ACTION_BUTTON_CLASS_NAME} h-11!`}
            >
              Join room
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function describeAcceptedJoin({ micOn, cameraOn }: DebateJoinState, otherName: string, videoEnabled: boolean) {
  const mic = micOn ? 'with your mic on' : 'muted';
  if (!videoEnabled) return `You’ll join ${mic}.`;
  if (cameraOn) return `You’ll join ${mic}. ${otherName} will see your camera.`;
  return micOn ? 'You’ll join with your mic on and your camera off.' : 'You’ll join muted, with your camera off.';
}

function participantName(participant: DebateRematchParticipant) {
  return participant.display_name || 'Debater';
}
