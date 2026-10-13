import { type DebateLobbyPerson, type DebateLobbySummary, dashlessId } from '../api';
import { useDebateLobbies } from './hooks';
import { useIsLobbyGuest } from './lobby-guest-hooks';

/**
 * A lobby's hosts from its lobbies-list row: the roster is empty before it opens. Best effort,
 * since the capped list may leave the row out; empty then.
 */
export function listedHosts(lobbies: DebateLobbySummary[], lobbyId: string): DebateLobbyPerson[] {
  return lobbies.find(row => dashlessId(row.lobby_id) === dashlessId(lobbyId))?.hosts ?? [];
}

/**
 * The next lobby `hostId` hosts, other than `lobbyId`: an open one first, else the soonest to
 * start. Returns the row and the host as the list names them.
 */
export function nextLobbyByHost(
  lobbies: DebateLobbySummary[],
  hostId: string | null,
  lobbyId: string
): { lobby: DebateLobbySummary; host: DebateLobbyPerson } | null {
  if (!hostId) return null;
  const host = dashlessId(hostId);
  let best: { lobby: DebateLobbySummary; host: DebateLobbyPerson } | null = null;
  for (const row of lobbies) {
    if (dashlessId(row.lobby_id) === dashlessId(lobbyId)) continue;
    const person = row.hosts.find(person => dashlessId(person.user_id) === host);
    if (!person) continue;
    if (!best || isSooner(row, best.lobby)) best = { lobby: row, host: person };
  }
  return best;
}

function isSooner(a: DebateLobbySummary, b: DebateLobbySummary) {
  if (a.open !== b.open) return a.open;
  return Date.parse(a.starts_at) < Date.parse(b.starts_at);
}

/**
 * Who hosts a lobby that has not opened. `LobbyView` carries no hosts yet, so this reads the list
 * row; once it does, this hook is the one place to switch.
 */
export function usePreOpenHosts(lobby: { lobby_id: string }): DebateLobbyPerson[] {
  return listedHosts(useListedLobbies(), lobby.lobby_id);
}

/**
 * The lobbies list, signed in only: geo-chat answers it for members alone. Inside a lobby only
 * `debate.my_lobby_changed` refreshes it, so a mount refetches once the copy is a minute old
 * rather than every time a card mounts.
 */
export function useListedLobbies() {
  const guest = useIsLobbyGuest();
  return useDebateLobbies(!guest, { staleTime: LISTED_LOBBIES_STALE_MS }).data?.lobbies ?? NO_LOBBIES;
}

const LISTED_LOBBIES_STALE_MS = 60_000;

const NO_LOBBIES: DebateLobbySummary[] = [];
