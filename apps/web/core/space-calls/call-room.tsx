'use client';

import * as React from 'react';

import type { LobbyPresenceState } from '~/core/debates/lobbies/hooks';
import type { useLobbyGuestSession } from '~/core/debates/lobbies/lobby-guest-hooks';
import { LobbyHeader } from '~/core/debates/lobbies/lobby-header';
import { type LobbyPhoneTab, LobbyRoomShell } from '~/core/debates/lobbies/lobby-room-shell';
import { LobbyPeople } from '~/core/debates/lobbies/lobby-roster';
import type { LobbyPageView } from '~/core/debates/lobbies/lobby-view';
import type { LobbyVoiceJoinChoice } from '~/core/debates/lobbies/lobby-voice';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';

import { PreJoinDeviceCheck } from '~/partials/community-calls/pre-join';

import { CallScreenStage } from './call-screen-stage';

/** A space call's room (GEO-3419): the lobby room with no claims, pairs or availability. */
export function CallRoom({
  lobby,
  state,
  onRetry,
  onLeave,
  voice,
  guestSession,
  exitHref,
}: {
  lobby: LobbyPageView;
  state: LobbyPresenceState;
  onRetry: () => void;
  onLeave: () => void;
  voice: { connectionId: string; setVoiceConnected: (connected: boolean) => void; awayAt: string | null };
  guestSession: ReturnType<typeof useLobbyGuestSession>;
  exitHref: string;
}) {
  const phone = useIsPhoneLayout();
  const currentUserId = useCurrentGeoChatUserId();
  // No aside, so no phone tabs; the shell still wants the state.
  const [tab, setTab] = React.useState<LobbyPhoneTab>('people');

  return (
    <LobbyRoomShell
      lobby={lobby}
      state={state}
      onRetry={onRetry}
      onLeave={onLeave}
      voice={voice}
      guestSession={guestSession}
      exitHref={exitHref}
      header={<LobbyHeader lobby={lobby} phone={phone} availability={null} />}
      people={
        <>
          <CallScreenStage members={lobby.members} />
          <LobbyPeople lobby={lobby} viewerId={currentUserId} ownAvailable={undefined} disagreements={null} />
        </>
      }
      tab={tab}
      onTab={setTab}
      voiceExtras={{ screenShare: true, preJoin: join => <CallPreJoin onJoin={join} /> }}
    />
  );
}

/** A host's or speaker's mic and camera check before their voice first connects. */
function CallPreJoin({ onJoin }: { onJoin: (choice: LobbyVoiceJoinChoice) => void }) {
  return (
    <div className="mx-auto w-full max-w-[640px]" data-testid="call-pre-join">
      <PreJoinDeviceCheck joinLabel="Join with these" joining={false} onJoin={onJoin} initialVideo={false} />
    </div>
  );
}
