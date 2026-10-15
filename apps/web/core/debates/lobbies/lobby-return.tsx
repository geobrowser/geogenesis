'use client';

import * as React from 'react';

import { consumeDebateReturnDestination, peekDebateReturnDestination } from '../debate-return-navigation';
import { debateRoomIdFromPath } from '../rooms/room-routes';
import { useMyDebateLobby } from './hooks';
import { clearCarriedLobbyMic, readCarriedLobbyMic, requestLobbyRejoin } from './step-out';

/**
 * geo-chat's lobby to return to: the one the viewer stepped out of, from any tab, or null. Undefined
 * while it is unknown (loading, or the call failed), so callers fall back to this tab.
 */
function useServerLobbyReturn(): { lobbyId: string | null } | undefined {
  const mine = useMyDebateLobby();
  if (mine.isError || !mine.data) return undefined;
  return { lobbyId: mine.data.stepped_out ? mine.data.current_lobby_id : null };
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
 * The mic the viewer had in the lobby they stepped out of to get here, so the picker or ready room
 * starts the same way: null when they did not come straight from one. Read once per mount and spent.
 */
export function useCarriedLobbyMic(): boolean | null {
  const [carried] = React.useState(readCarriedLobbyMic);
  React.useEffect(() => clearCarriedLobbyMic(), []);
  return carried;
}

/**
 * For a debate flow's Leave: when the flow is returning to a lobby, has the lobby join again on
 * arrival rather than ask. Leaving still goes the usual way, through
 * `useConsumeDebateReturnDestination`; this only says what the lobby does once it gets there.
 *
 * Decided when Leave is pressed, from the same answer that destination is: geo-chat's lobby once it
 * has replied, this tab's record until then. Nothing here waits on a lookup, so a Leave pressed the
 * moment the picker opens still rejoins. Whether the viewer may rejoin (the lobby is open, a host
 * has not removed them) is the lobby page's call, which it makes before honouring the request.
 *
 * The debate's end card used to offer this as its own "Back to <lobby>" row. GEO-3301 sends the
 * pair to the claim picker instead, whose Leave returns to the lobby anyway, so the rejoin rides on
 * that rather than on a second button for the same way out.
 */
export function useLobbyRejoinOnLeave(): () => void {
  const lobby = useServerLobbyReturn();
  const known = lobby !== undefined;
  const lobbyId = lobby?.lobbyId ?? null;
  return React.useCallback(() => {
    const destination = known ? lobbyId : storedLobbyId();
    if (destination) requestLobbyRejoin(destination);
  }, [known, lobbyId]);
}

/** The lobby in this tab's record of where the flow returns to, or null when it is a page. */
function storedLobbyId(): string | null {
  const destination = peekDebateReturnDestination();
  return destination ? debateRoomIdFromPath(destination) : null;
}
