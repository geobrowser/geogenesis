'use client';

import * as React from 'react';

import { consumeDebateReturnDestination, peekDebateReturnDestination } from '../debate-return-navigation';
import { debateRoomIdFromPath } from '../rooms/room-routes';
import { useDebateLobby, useMyDebateLobby } from './hooks';
import { requestLobbyRejoin } from './step-out';

/**
 * geo-chat's lobby to return to: the one the viewer stepped out of, from any tab, or null. Undefined
 * while it is unknown (loading, or the call failed), so callers fall back to this tab.
 */
function useServerLobbyReturn(): { lobbyId: string | null } | undefined {
  const mine = useMyDebateLobby();
  if (mine.isError || !mine.data) return undefined;
  return { lobbyId: mine.data.stepped_out ? mine.data.current_lobby_id : null };
}

/** The lobby this debate flow returns to; null when it did not start in one or that lobby is gone. */
export function useRecordedLobby(): string | null {
  const mine = useMyDebateLobby();
  // This tab's record, read once per mount; used only when geo-chat cannot answer.
  const [stored] = React.useState(() => {
    const destination = peekDebateReturnDestination();
    return destination ? debateRoomIdFromPath(destination) : null;
  });

  if (mine.isError) return stored;
  return mine.data?.stepped_out ? mine.data.current_lobby_id : null;
}

/** The leave paths' `consumeDebateReturnDestination`, preferring geo-chat's lobby over this tab's. */
export function useConsumeDebateReturnDestination() {
  const lobby = useServerLobbyReturn();
  const lobbyId = lobby?.lobbyId;
  const known = lobby !== undefined;
  return React.useCallback(
    () => consumeDebateReturnDestination(known ? { lobbyId: lobbyId ?? null } : undefined),
    [known, lobbyId]
  );
}

/**
 * For a debate flow's Leave: when the flow started in a lobby that is still open to the viewer, has
 * the lobby join again on arrival rather than ask. Leaving still goes the usual way, through
 * `useConsumeDebateReturnDestination`; this only says what the lobby does once it gets there.
 *
 * The debate's end card used to offer this as its own "Back to <lobby>" row. GEO-3301 sends the
 * pair to the claim picker instead, whose Leave returns to the lobby anyway, so the rejoin rides on
 * that rather than on a second button for the same way out.
 */
export function useLobbyRejoinOnLeave(): () => void {
  const lobbyId = useRecordedLobby();
  const lobby = useDebateLobby(lobbyId ?? '', lobbyId !== null).data;
  // A host removed them, or the lobby is gone: going back is a choice made on the lobby page.
  const rejoinable = lobbyId !== null && lobby?.access.status === 'admitted' && !lobby.viewer.removed;
  return React.useCallback(() => {
    if (rejoinable && lobbyId) requestLobbyRejoin(lobbyId);
  }, [lobbyId, rejoinable]);
}
