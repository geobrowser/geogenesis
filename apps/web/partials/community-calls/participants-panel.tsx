'use client';

import { useParticipants } from '@livekit/components-react';

import * as React from 'react';

import { Track } from 'livekit-client';
import type { Participant } from 'livekit-client';

import { muteParticipant, removeParticipant } from '~/core/community-calls/api';
import { parseParticipantMetadata } from '~/core/community-calls/types';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';

import { Avatar } from '~/design-system/avatar';
import { Dropdown } from '~/design-system/dropdown';
import { Ellipsis } from '~/design-system/icons/ellipsis';

type Props = {
  roomName: string;
  /** The current user's own LiveKit join token — curator-backend verifies it grants roomAdmin before allowing a remove. */
  livekitToken: string;
  canModerate: boolean;
};

/** Participant list + editor-only moderation (mute / disable camera / stop screen share / remove). */
export function ParticipantsPanel({ roomName, livekitToken, canModerate }: Props) {
  const participants = useParticipants();
  const { getToken } = useCommunityCallIdentityToken();
  const [busyIdentity, setBusyIdentity] = React.useState<string | null>(null);

  const runModeration = async (identity: string, fn: (token: string) => Promise<unknown>) => {
    setBusyIdentity(identity);
    try {
      const token = await getToken();
      if (token) await fn(token);
    } finally {
      setBusyIdentity(null);
    }
  };

  const onMuteTrack = (
    participant: Participant,
    source: Track.Source,
    trackType: 'microphone' | 'camera' | 'screen_share'
  ) => {
    const publication = participant.getTrackPublication(source);
    if (!publication) return;
    return runModeration(participant.identity, token =>
      muteParticipant(
        { room: roomName, identity: participant.identity, trackSid: publication.trackSid, muted: true, trackType },
        token
      )
    );
  };

  const onRemove = (participant: Participant) =>
    runModeration(participant.identity, token =>
      removeParticipant({ room: roomName, identity: participant.identity, livekitToken }, token)
    );

  const editors = participants.filter(p => parseParticipantMetadata(p.metadata).isEditor);
  const members = participants.filter(p => {
    const meta = parseParticipantMetadata(p.metadata);
    return !meta.isEditor && !p.identity.startsWith('Viewer_');
  });
  const watcherCount = participants.length - editors.length - members.length;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <ParticipantGroup
        title="Editors"
        participants={editors}
        canModerate={canModerate}
        busyIdentity={busyIdentity}
        onMuteTrack={onMuteTrack}
        onRemove={onRemove}
      />
      <ParticipantGroup
        title="Members"
        participants={members}
        canModerate={canModerate}
        busyIdentity={busyIdentity}
        onMuteTrack={onMuteTrack}
        onRemove={onRemove}
      />
      {watcherCount > 0 && <p className="text-metadata text-grey-04">{watcherCount} watching</p>}
    </div>
  );
}

function ParticipantGroup({
  title,
  participants,
  canModerate,
  busyIdentity,
  onMuteTrack,
  onRemove,
}: {
  title: string;
  participants: Participant[];
  canModerate: boolean;
  busyIdentity: string | null;
  onMuteTrack: (
    participant: Participant,
    source: Track.Source,
    trackType: 'microphone' | 'camera' | 'screen_share'
  ) => void;
  onRemove: (participant: Participant) => void;
}) {
  if (participants.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-metadataMedium text-grey-04">{title}</h3>
      <ul className="flex flex-col gap-2">
        {participants.map(participant => {
          const meta = parseParticipantMetadata(participant.metadata);
          const micPub = participant.getTrackPublication(Track.Source.Microphone);
          const camPub = participant.getTrackPublication(Track.Source.Camera);
          const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
          const busy = busyIdentity === participant.identity;

          return (
            <li key={participant.identity} className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-6 shrink-0 overflow-hidden rounded-full">
                  <Avatar
                    value={participant.name || participant.identity}
                    avatarUrl={meta.avatarCid ? `ipfs://${meta.avatarCid}` : undefined}
                    size={24}
                  />
                </span>
                <span className="truncate text-metadata text-text">{participant.name || participant.identity}</span>
              </div>

              {canModerate && (
                <Dropdown
                  trigger={<Ellipsis />}
                  align="end"
                  options={[
                    ...(micPub && !micPub.isMuted
                      ? [
                          {
                            label: 'Mute',
                            value: 'mute',
                            disabled: busy,
                            onClick: () => onMuteTrack(participant, Track.Source.Microphone, 'microphone'),
                          },
                        ]
                      : []),
                    ...(camPub && !camPub.isMuted
                      ? [
                          {
                            label: 'Disable camera',
                            value: 'disable-camera',
                            disabled: busy,
                            onClick: () => onMuteTrack(participant, Track.Source.Camera, 'camera'),
                          },
                        ]
                      : []),
                    ...(screenPub && !screenPub.isMuted
                      ? [
                          {
                            label: 'Stop screen share',
                            value: 'stop-screen-share',
                            disabled: busy,
                            onClick: () => onMuteTrack(participant, Track.Source.ScreenShare, 'screen_share'),
                          },
                        ]
                      : []),
                    {
                      label: 'Remove from call',
                      value: 'remove',
                      disabled: busy,
                      onClick: () => onRemove(participant),
                    },
                  ]}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
