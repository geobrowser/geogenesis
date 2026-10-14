'use client';

import * as React from 'react';

import { ActionContextProvider } from '~/core/action-context-provider';

import { dashlessId } from '../api';
import { lobbyHeadcountSeen, lobbyRoomVoteSeen, lobbyViewerRole } from './lobby-analytics';
import { lobbyRoomHeadcount } from './lobby-format';
import { useLobbyHighlights } from './lobby-highlights-hooks';
import { type LobbyPageView, isMemberView } from './lobby-view';

/**
 * Lobby attribution for everything inside an admitted lobby (GEO-3311). Every action taken here
 * carries the lobby's id, and a vote on the claim the room is voting on carries that room vote's id
 * too. Also reports the viewer's role changes, the room's headcount and, from a hosting tab, how
 * each room vote ended.
 */
export function LobbyAnalyticsScope({ lobby, children }: { lobby: LobbyPageView; children: React.ReactNode }) {
  const lobbyId = dashlessId(lobby.lobby_id);
  const member = isMemberView(lobby) ? lobby : null;
  const inRoom = member?.viewer.connected ?? false;
  const hosting = member?.viewer.hosting ?? false;
  // Watches the cache only. In the room, the room vote card (desktop) or the phone's Claims mark
  // already reads it, and gateway events keep it current; this adds no request.
  const roomVote = useLobbyHighlights(lobby.lobby_id, false).data?.room_vote ?? null;

  const role = member?.viewer.role ?? null;
  const moderation = member?.viewer.last_moderation;
  React.useEffect(() => {
    if (inRoom) lobbyViewerRole(lobbyId, { role, hosting, moderation });
  }, [hosting, inRoom, lobbyId, moderation, role]);

  const headcount = lobbyRoomHeadcount(lobby);
  React.useEffect(() => {
    if (inRoom) lobbyHeadcountSeen(lobbyId, headcount);
  }, [headcount, inRoom, lobbyId]);

  React.useEffect(() => {
    if (inRoom && hosting) lobbyRoomVoteSeen(lobbyId, roomVote);
  }, [hosting, inRoom, lobbyId, roomVote]);

  const scope = React.useMemo(
    () => ({
      lobby_id: lobbyId,
      room_vote_id: roomVote?.vote_id,
      room_vote_claim_id: roomVote?.claim.claim_entity_id,
    }),
    [lobbyId, roomVote?.claim.claim_entity_id, roomVote?.vote_id]
  );
  return <ActionContextProvider value={scope}>{children}</ActionContextProvider>;
}
