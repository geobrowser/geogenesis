import { type DebateLobbyPerson, type DebateLobbySummary, dashlessId } from '../api';
import { useDebateLobbies, useRefetchAtOpening } from './hooks';

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
 * Who hosts a lobby that has not opened: the view's `hosts`, an empty list included. Older geo-chat
 * leaves it out, so this falls back to the list row.
 */
export function usePreOpenHosts(lobby: { lobby_id: string; hosts?: DebateLobbyPerson[] }): DebateLobbyPerson[] {
  const listed = useListedLobbies(lobby.hosts === undefined);
  return lobby.hosts ?? listedHosts(listed, lobby.lobby_id);
}

/**
 * The lobbies list, a guest's too since it lists without an account (GEO-3289). Inside a lobby only
 * `debate.my_lobby_changed` refreshes it, so a mount refetches once the copy is a minute old, and
 * the list refetches when a listed lobby opens.
 */
export function useListedLobbies(enabled = true) {
  const query = useDebateLobbies(enabled, { staleTime: LISTED_LOBBIES_STALE_MS });
  const lobbies = query.data?.lobbies ?? NO_LOBBIES;
  // `refetch` ignores `enabled`.
  useRefetchAtOpening(query, enabled ? soonestOpening(lobbies) : null);
  return lobbies;
}

/** The earliest `opens_at` among listed lobbies not open yet. */
export function soonestOpening(lobbies: DebateLobbySummary[]): string | null {
  let soonest: string | null = null;
  for (const row of lobbies) {
    if (row.open || Number.isNaN(Date.parse(row.opens_at))) continue;
    if (!soonest || Date.parse(row.opens_at) < Date.parse(soonest)) soonest = row.opens_at;
  }
  return soonest;
}

const LISTED_LOBBIES_STALE_MS = 60_000;

const NO_LOBBIES: DebateLobbySummary[] = [];
