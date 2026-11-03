'use client';

import * as React from 'react';

/**
 * What a lobby row is for (GEO-3419): a debate lobby, or a space's call. A call runs on the lobby
 * stack and page, with the debate parts (claims, pairs, requests, availability) left out.
 */
export type LobbyRoomPurpose = { purpose: 'lobby' } | { purpose: 'call'; spaceId: string; exitHref: string };

/** The word for this room in copy shared by lobbies and calls. */
export type LobbyRoomNoun = 'lobby' | 'call';

/**
 * What a room supports, so the shared room components read features instead of asking whether
 * this is a call. The `spaceCalls` flag stays at the sites it gates; nothing here reads it.
 */
export type RoomCapabilities = {
  noun: LobbyRoomNoun;
  /** The space a call belongs to: where leaving, sharing and its calls tab go. `null` for a lobby. */
  space: { id: string; exitHref: string } | null;
  /**
   * Debates: pairs, availability, disagreements, requests and schedules, "in a debate", "New", the
   * away warning, the claims aside and the room's lobby analytics.
   */
  debates: boolean;
  /** A closed or empty room suggests its host's next lobby. */
  nextLobby: boolean;
  /** Recording surfaces apply. Whether one runs is server state (`callRecordingOf`), never this. */
  recording: boolean;
  screenShare: boolean;
  chat: boolean;
};

export function roomCapabilities(purpose: LobbyRoomPurpose): RoomCapabilities {
  if (purpose.purpose === 'call') {
    return {
      noun: 'call',
      space: { id: purpose.spaceId, exitHref: purpose.exitHref },
      debates: false,
      nextLobby: false,
      recording: true,
      screenShare: true,
      chat: false,
    };
  }
  return {
    noun: 'lobby',
    space: null,
    debates: true,
    nextLobby: true,
    recording: false,
    screenShare: true,
    chat: false,
  };
}

const RoomCapabilitiesContext = React.createContext<RoomCapabilities>(roomCapabilities({ purpose: 'lobby' }));

/** Set by the call page; everything under a lobby reads the default. */
export function RoomCapabilitiesProvider({
  purpose,
  children,
}: {
  purpose: LobbyRoomPurpose;
  children: React.ReactNode;
}) {
  const capabilities = React.useMemo(() => roomCapabilities(purpose), [purpose]);
  return <RoomCapabilitiesContext.Provider value={capabilities}>{children}</RoomCapabilitiesContext.Provider>;
}

export function useRoomCapabilities() {
  return React.useContext(RoomCapabilitiesContext);
}
