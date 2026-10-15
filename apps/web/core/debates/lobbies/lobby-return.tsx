'use client';

import * as React from 'react';

import {
  consumeDebateReturnDestination,
  peekDebateReturnDestination,
  rememberLobbyReturnDestination,
} from '../debate-return-navigation';
import { sameId } from '../rooms/room-presence';
import { debateRoomIdFromPath } from '../rooms/room-routes';
import { useMyDebateLobby } from './hooks';
import { clearCarriedLobbyMic, readCarriedLobbyMic } from './step-out';

/** The lobby in this tab's record of where the flow returns to, or null when it is a page. */
function storedLobbyId(): string | null {
  const destination = peekDebateReturnDestination();
  return destination ? debateRoomIdFromPath(destination) : null;
}

/**
 * geo-chat's lobby to return to: the one the viewer stepped out of, from any tab, or null. Undefined
 * while it is unknown (loading, or the call failed), so callers fall back to this tab.
 *
 * A lobby tab left open rejoins once the debate is over, which ends the step-out while this flow can
 * still be in the picker. So the lobby is recorded as this tab's way back as soon as geo-chat names
 * it, and stays the way back while the viewer is still on its roster; leaving it or moving on does not.
 */
function useServerLobbyReturn(): { lobbyId: string | null } | undefined {
  const mine = useMyDebateLobby();
  const steppedOutOf = mine.data?.stepped_out ? mine.data.current_lobby_id : null;
  React.useEffect(() => {
    if (steppedOutOf) rememberLobbyReturnDestination(steppedOutOf);
  }, [steppedOutOf]);

  if (mine.isError || !mine.data) return undefined;
  const current = mine.data.current_lobby_id;
  if (!current) return { lobbyId: null };
  if (mine.data.stepped_out) return { lobbyId: current };
  const recorded = storedLobbyId();
  return { lobbyId: recorded && sameId(recorded, current) ? current : null };
}

/**
 * The leave paths' `consumeDebateReturnDestination`, preferring geo-chat's lobby over this tab's. A
 * lobby joins on arrival by itself (GEO-3337), so nothing here asks it to.
 */
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
