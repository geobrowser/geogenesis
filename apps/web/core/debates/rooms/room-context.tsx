'use client';

import * as React from 'react';

import type { DebateRoomPresence } from './room-presence';

export type DebateRoomContextValue = {
  roomId: string;
  /** `null` while the viewer's identity or the room payload is still resolving. */
  presence: DebateRoomPresence | null;
  /** Asks the room for a fresh session when the one it handed out has ended; resolves whether it landed. */
  rejoin?: () => Promise<boolean>;
};

/**
 * What the debate-again picker needs to know about the room around it (GEO-2941). A context rather
 * than a prop keeps the room a wrapper, and leaves the picker's own route reading the default.
 */
const DebateRoomContext = React.createContext<DebateRoomContextValue | null>(null);

export function DebateRoomProvider({
  roomId,
  presence,
  rejoin,
  children,
}: {
  roomId: string;
  presence: DebateRoomPresence | null;
  rejoin?: () => Promise<boolean>;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ roomId, presence, rejoin }), [roomId, presence, rejoin]);
  return <DebateRoomContext.Provider value={value}>{children}</DebateRoomContext.Provider>;
}

/** The room around this subtree, or `null` outside one. */
export function useDebateRoomContext() {
  return React.useContext(DebateRoomContext);
}

/**
 * Whether the picker is rendered inside a room. Distinct from knowing the opponent is present: a
 * room whose presence has not resolved is still a room, and the session it renders is shared with
 * it rather than owned by it.
 */
export function useInDebateRoom(): boolean {
  return React.useContext(DebateRoomContext) !== null;
}

/**
 * `true` outside a room, where there is no join event to wait on. Inside one an unresolved presence
 * is `false`, or Request debate opens against someone the room has not said is there.
 */
export function useRoomOpponentPresent(): boolean {
  const room = React.useContext(DebateRoomContext);
  if (room === null) return true;
  return room.presence?.opponentPresent ?? false;
}
