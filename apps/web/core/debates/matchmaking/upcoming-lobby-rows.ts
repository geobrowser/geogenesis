import {
  type DebateLobbyPerson,
  type DebateLobbySummary,
  type UpcomingDebateRoom,
  dashlessId,
} from '~/core/debates/api';
import { sameId } from '~/core/debates/rooms/room-presence';

/**
 * A lobby in the Requests tab's upcoming list (GEO-3292): one the viewer said Going to, or one they
 * host. Sits beside scheduled debates, ordered by start with them.
 */
export type UpcomingLobbyRow = {
  lobbyId: string;
  name: string;
  startsAt: string;
  opensAt: string;
  /** The door is open now. */
  open: boolean;
  /** The scheduled start has passed. */
  due: boolean;
  /** Empty when the lobby is not in the side panel list, which caps how many it returns. */
  hosts: DebateLobbyPerson[];
  hosting: boolean;
  onRoster: boolean;
};

/**
 * Two sources, because neither has every lobby. `/me/debate-rooms` lists the ones the viewer said
 * Going to, but not the ones they host: a host is not on their own lobby's Going list. The side
 * panel list names hosts but caps how many lobbies it returns. Going rows come from the first and
 * borrow hosts from the second; hosted rows come from the second.
 *
 * geo-chat drops a Going entry once the viewer joins, so a Going lobby leaves the list when they go
 * in, as the open banner does. A hosted one stays until it ends.
 */
export function upcomingLobbyRows(
  rooms: UpcomingDebateRoom[],
  lobbies: DebateLobbySummary[],
  viewerId: string | null
): UpcomingLobbyRow[] {
  const summaries = new Map(lobbies.map(lobby => [dashlessId(lobby.lobby_id), lobby]));
  const hostedBy = (lobby: DebateLobbySummary | undefined) =>
    viewerId !== null && lobby !== undefined && lobby.hosts.some(host => sameId(host.user_id, viewerId));

  const rows = new Map<string, UpcomingLobbyRow>();

  for (const room of rooms) {
    if (room.kind !== 'lobby') continue;
    const id = dashlessId(room.room_id);
    const summary = summaries.get(id);
    rows.set(id, {
      lobbyId: room.room_id,
      name: room.name || summary?.name || 'Debate lobby',
      startsAt: room.starts_at,
      opensAt: room.opens_at,
      open: room.joinable,
      due: room.due,
      hosts: summary?.hosts ?? [],
      hosting: hostedBy(summary),
      onRoster: summary?.viewer_on_roster ?? false,
    });
  }

  for (const lobby of lobbies) {
    const id = dashlessId(lobby.lobby_id);
    // Only lobbies set for a time: one opened on the spot is already on the host's screen.
    if (rows.has(id) || !lobby.scheduled || !hostedBy(lobby)) continue;
    rows.set(id, {
      lobbyId: lobby.lobby_id,
      name: lobby.name,
      startsAt: lobby.starts_at,
      opensAt: lobby.opens_at,
      open: lobby.open,
      due: lobby.open && Date.parse(lobby.starts_at) <= Date.now(),
      hosts: lobby.hosts,
      hosting: true,
      onRoster: lobby.viewer_on_roster,
    });
  }

  return [...rows.values()];
}

/** Scheduled debates and lobbies as one list, soonest first. */
export function byStart<T extends { startsAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
