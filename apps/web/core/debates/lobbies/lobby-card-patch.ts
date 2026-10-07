import { type DebateLobbiesResponse, type DebateLobbySummary, dashlessId } from '../api';

/** `DebateLobbySummary` as broadcast: nothing about whoever receives it. */
export type DebateLobbyCard = Omit<DebateLobbySummary, 'viewer_reminded' | 'viewer_on_roster'>;

export type DebateLobbyCardPatch =
  { status: 'listed'; insert: boolean; asOf: number; lobby: DebateLobbyCard } | { status: 'removed'; lobbyId: string };

/**
 * `debate.lobbies_changed`'s `lobby_card`. `null` for an absent or unreadable one, which the caller
 * answers with a refetch: the field is missing from a geo-chat that predates it, and from the
 * events routed to one viewer about their own standing.
 */
export function parseLobbyCardPatch(lobbyId: string | undefined, value: unknown): DebateLobbyCardPatch | null {
  if (!isRecord(value)) return null;

  if (value.status === 'removed') return lobbyId ? { status: 'removed', lobbyId } : null;
  if (value.status !== 'listed') return null;

  const asOf = typeof value.as_of === 'string' ? Date.parse(value.as_of) : NaN;
  const lobby = value.lobby;
  if (Number.isNaN(asOf) || !isRecord(lobby) || typeof lobby.lobby_id !== 'string') return null;
  if (typeof lobby.headcount !== 'number' || typeof lobby.starts_at !== 'string' || typeof lobby.open !== 'boolean') {
    return null;
  }

  return { status: 'listed', insert: value.insert === true, asOf, lobby: lobby as DebateLobbyCard };
}

/**
 * The cached list with one patch applied, or the same list when the patch changes nothing. A
 * missing row is added only on `insert`: any other absence is the list's caps or a ban.
 */
export function applyLobbyCardPatch(list: DebateLobbiesResponse, patch: DebateLobbyCardPatch): DebateLobbiesResponse {
  if (patch.status === 'removed') {
    const lobbies = list.lobbies.filter(row => dashlessId(row.lobby_id) !== dashlessId(patch.lobbyId));
    return lobbies.length === list.lobbies.length ? list : { lobbies };
  }

  const id = dashlessId(patch.lobby.lobby_id);
  const cached = list.lobbies.find(row => dashlessId(row.lobby_id) === id);
  if (!cached && !patch.insert) return list;

  const row: DebateLobbySummary = {
    ...patch.lobby,
    viewer_reminded: cached?.viewer_reminded ?? false,
    viewer_on_roster: cached?.viewer_on_roster ?? false,
  };
  const others = list.lobbies.filter(other => dashlessId(other.lobby_id) !== id);

  return { lobbies: sortLobbies([...others, row]) };
}

/** geo-chat's order: open first, busiest first; upcoming soonest first; then by id. */
export function sortLobbies(lobbies: DebateLobbySummary[]) {
  return [...lobbies].sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (a.open && a.headcount !== b.headcount) return b.headcount - a.headcount;

    const byStart = Date.parse(a.starts_at) - Date.parse(b.starts_at);
    if (byStart !== 0) return byStart;

    const left = dashlessId(a.lobby_id);
    const right = dashlessId(b.lobby_id);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
