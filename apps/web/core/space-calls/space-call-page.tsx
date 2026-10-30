'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import type { DebateLobbyView } from '~/core/debates/api';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { useDebateLobby } from '~/core/debates/lobbies/hooks';
import { useDebateLobbyGuestView } from '~/core/debates/lobbies/lobby-guest-hooks';
import { DebateLobbyPage } from '~/core/debates/lobbies/lobby-page';
import { LobbyPurposeProvider, type LobbyRoomPurpose } from '~/core/debates/lobbies/lobby-purpose';
import { sameId } from '~/core/debates/rooms/room-presence';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import { NavUtils } from '~/core/utils/utils';

import { spaceCallPath } from './routes';

/**
 * A space call's page (GEO-3419): the lobby page under the call purpose. Not behind the flag, so a
 * shared link opens for anyone, signed-out listeners included; the flag gates starting and finding.
 */
export function SpaceCallPage({ spaceId, callId }: { spaceId: string; callId: string }) {
  const purpose = React.useMemo<LobbyRoomPurpose>(
    () => ({ purpose: 'call', spaceId, exitHref: NavUtils.toSpace(spaceId) }),
    [spaceId]
  );
  // Blank while leaving for the right page, so a lobby is never joined or drawn as a call.
  if (useCallAtItsPath(spaceId, callId)) return <div className="min-h-[calc(100dvh-2.75rem)]" />;

  return (
    <LobbyPurposeProvider value={purpose}>
      <DebateLobbyPage key={callId} lobbyId={callId} />
    </LobbyPurposeProvider>
  );
}

/** The call view, member or guest, from the reads the lobby page already makes. */
function useRoomView(roomId: string, enabled = true): Pick<DebateLobbyView, 'purpose' | 'call'> | undefined {
  const { ready, authenticated } = useGeoChatAuth();
  const member = useDebateLobby(roomId, enabled).data;
  const guest = useDebateLobbyGuestView(roomId, { enabled: enabled && ready && !authenticated }).data?.lobby;
  return member ?? guest;
}

/** A lobby id sent here goes to the lobby; a call under another space's path goes to its own. */
function useCallAtItsPath(spaceId: string, callId: string) {
  const router = useRouter();
  const view = useRoomView(callId);
  const target =
    view === undefined
      ? null
      : view.purpose !== 'call'
        ? debateRoomPath(callId)
        : view.call && !sameId(view.call.space_id, spaceId)
          ? spaceCallPath(view.call.space_id, callId)
          : null;
  React.useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);
  return target !== null;
}

/**
 * For `/debate/{id}`: where a call opened there belongs, or `null` for a lobby or while unknown.
 * Calls answer the lobby endpoints, so they reach the room page by id, e.g. from `current_call_id`.
 */
export function useSpaceCallRedirect(roomId: string, enabled: boolean) {
  const router = useRouter();
  const view = useRoomView(roomId, enabled);
  const target = view?.purpose === 'call' && view.call ? spaceCallPath(view.call.space_id, roomId) : null;
  React.useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);
  return target !== null;
}
