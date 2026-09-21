'use client';

import * as React from 'react';

import type { DebateRoomPresence } from './room-presence';

/**
 * What the debate-again picker needs to know about the room around it (GEO-2941). A context rather
 * than a prop keeps the room a wrapper, and leaves the picker's own route reading the default.
 */
const DebateRoomContext = React.createContext<DebateRoomPresence | null>(null);

export function DebateRoomProvider({
  presence,
  children,
}: {
  presence: DebateRoomPresence | null;
  children: React.ReactNode;
}) {
  return <DebateRoomContext.Provider value={presence}>{children}</DebateRoomContext.Provider>;
}

/** The room's presence, or `null` outside a room and before it resolves. */
export function useDebateRoomContext() {
  return React.useContext(DebateRoomContext);
}

/**
 * Whether the opponent condition a room imposes is met. `true` outside a room, where there is no
 * join event to wait on; inside one, the mic and Request debate wait for state 3.
 */
export function useRoomOpponentPresent(): boolean {
  const presence = useDebateRoomContext();
  return presence === null || presence.opponentPresent;
}
