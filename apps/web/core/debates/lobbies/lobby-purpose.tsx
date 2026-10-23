'use client';

import * as React from 'react';

/**
 * What a lobby row is for (GEO-3419): a debate lobby, or a space's call. A call runs on the lobby
 * stack and page, with the debate parts (claims, pairs, requests, availability) left out.
 */
export type LobbyRoomPurpose = { purpose: 'lobby' } | { purpose: 'call'; spaceId: string; exitHref: string };

const LOBBY: LobbyRoomPurpose = { purpose: 'lobby' };
const LobbyPurposeContext = React.createContext<LobbyRoomPurpose>(LOBBY);

/** Set by the call page; everything under a lobby reads the default. */
export const LobbyPurposeProvider = LobbyPurposeContext.Provider;

export function useLobbyRoomPurpose() {
  return React.useContext(LobbyPurposeContext);
}

export function useIsCallRoom() {
  return React.useContext(LobbyPurposeContext).purpose === 'call';
}
