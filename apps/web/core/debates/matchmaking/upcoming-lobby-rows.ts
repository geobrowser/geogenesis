import {
  type DebateLobbyCalendarRow,
  type DebateLobbyPerson,
  type DebateLobbySummary,
  type UpcomingDebateRoom,
  dashlessId,
} from '~/core/debates/api';
import { hostsLabel, localDaysFrom, startOfLocalDay } from '~/core/debates/lobbies/lobby-format';
import { sameId } from '~/core/debates/rooms/room-presence';

/**
 * A lobby under Upcoming lobbies in the Requests tab (GEO-3292): one the viewer said Going to, or
 * one they host.
 */
export type UpcomingLobbyRow = {
  lobbyId: string;
  name: string;
  startsAt: string;
  opensAt: string;
  /** The door is open now. */
  open: boolean;
  /** Empty when the lobby is not in the side panel list, which caps how many it returns. */
  hosts: DebateLobbyPerson[];
  hosting: boolean;
  onRoster: boolean;
};

/**
 * Who hosts a lobby row, for its card and its timeline row alike: "You’re hosting", "Hosted by …",
 * or `null` when the list that names hosts did not return this lobby.
 */
export function lobbyHostLine(row: Pick<UpcomingLobbyRow, 'hosting' | 'hosts'>) {
  if (row.hosting) return 'You’re hosting';
  const hosts = hostsLabel(row.hosts);
  return hosts ? `Hosted by ${hosts}` : null;
}

/** The viewer is one of `lobby`'s hosts. Never before the viewer is known. */
function viewerHosts(lobby: Pick<DebateLobbySummary, 'hosts'>, viewerId: string | null) {
  return viewerId !== null && lobby.hosts.some(host => sameId(host.user_id, viewerId));
}

/**
 * Two sources, because neither has every lobby. `/me/debate-rooms` lists the ones the viewer said
 * Going to, but not the ones they host: a host is not on their own lobby's Going list. The side
 * panel list names hosts but caps how many lobbies it returns. Going rows come from the first and
 * borrow hosts from the second; hosted rows come from the second.
 *
 * The list's own Going lobbies too, while they are still to open (GEO-3519): an RSVP writes the
 * list's row at once, and `/me/debate-rooms` hears of it only when geo-chat's event comes round.
 * Without them, a lobby RSVP'd from the timeline would leave it, as one not going, until then.
 * The list always carries a lobby the viewer RSVP'd to, whatever its caps.
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
  const hostedBy = (lobby: DebateLobbySummary | undefined) => lobby !== undefined && viewerHosts(lobby, viewerId);

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
      hosts: summary?.hosts ?? [],
      hosting: hostedBy(summary),
      onRoster: summary?.viewer_on_roster ?? false,
    });
  }

  for (const lobby of lobbies) {
    const id = dashlessId(lobby.lobby_id);
    const hosting = hostedBy(lobby);
    // Only lobbies set for a time: one opened on the spot is already on the host's screen. Before
    // the viewer is known, nothing: whether they host it cannot be told yet.
    if (rows.has(id) || !lobby.scheduled || viewerId === null) continue;
    if (!hosting && !(lobby.viewer_reminded && !lobby.open)) continue;
    rows.set(id, {
      lobbyId: lobby.lobby_id,
      name: lobby.name,
      startsAt: lobby.starts_at,
      opensAt: lobby.opens_at,
      open: lobby.open,
      hosts: lobby.hosts,
      hosting,
      onRoster: lobby.viewer_on_roster,
    });
  }

  // Soonest first: the two sources each have their own order.
  return [...rows.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** How far ahead the Requests timeline offers lobbies the viewer has not answered: today and the six days after. */
export const UNANSWERED_LOBBY_DAYS = 7;

/**
 * The calendar range the unanswered lobbies are read from: today's local midnight to the one
 * {@link UNANSWERED_LOBBY_DAYS} days on. Midnights, so the read's key moves once a day, not with
 * the clock.
 */
export function unansweredLobbyRange(now: number) {
  const from = new Date(startOfLocalDay(now));
  const to = new Date(from);
  // By the calendar, not by 24-hour steps, which a daylight saving change would knock off midnight.
  to.setDate(to.getDate() + UNANSWERED_LOBBY_DAYS);
  return { from, to };
}

/**
 * Upcoming lobbies the viewer has not answered (GEO-3519), for the Requests timeline to offer with
 * RSVP and Dismiss: still to open, starting within {@link UNANSWERED_LOBBY_DAYS} local days, and
 * not one they RSVP'd to, host or dismissed. `going` is the timeline's own lobby rows, so a lobby
 * is never drawn twice, whichever read knew of the RSVP first.
 *
 * From geo-chat's calendar range ({@link unansweredLobbyRange}) rather than the side panel's list,
 * which caps upcoming lobbies at twenty and two per creator, dismissed ones included: read from it,
 * a week could miss lobbies, and dismissing some would not bring others in. The week is the bound.
 *
 * Nothing before the viewer is known, which is also nothing signed out: hosting cannot be told, and
 * Dismiss needs an account.
 */
export function unansweredLobbies(
  lobbies: DebateLobbyCalendarRow[],
  going: Pick<UpcomingLobbyRow, 'lobbyId'>[],
  viewerId: string | null,
  now: number
): DebateLobbyCalendarRow[] {
  if (viewerId === null) return [];
  const shown = new Set(going.map(row => dashlessId(row.lobbyId)));
  return lobbies.filter(lobby => {
    if (lobby.state !== 'upcoming' || lobby.viewer_reminded || lobby.viewer_dismissed) return false;
    if (shown.has(dashlessId(lobby.lobby_id))) return false;
    if (viewerHosts(lobby, viewerId)) return false;
    const days = localDaysFrom(now, Date.parse(lobby.starts_at));
    return days >= 0 && days < UNANSWERED_LOBBY_DAYS;
  });
}
