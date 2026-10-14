import {
  type DebateLobbiesResponse,
  type DebateLobbyCalendarResponse,
  type DebateLobbySummary,
  dashlessId,
} from '../api';

/** `DebateLobbySummary` as broadcast: nothing about whoever receives it. */
export type DebateLobbyCard = Omit<DebateLobbySummary, 'viewer_reminded' | 'viewer_on_roster' | 'as_of'>;

export type DebateLobbyCardPatch = { asOf: string; lobby: DebateLobbyCard };

/**
 * `debate.lobbies_changed`'s `lobby_card`; `null` when absent or unreadable, which means refetch.
 * Create, open and close arrive without one.
 */
export function parseLobbyCardPatch(value: unknown): DebateLobbyCardPatch | null {
  if (!isRecord(value) || value.status !== 'listed') return null;
  if (typeof value.as_of !== 'string' || Number.isNaN(Date.parse(value.as_of))) return null;

  const lobby = value.lobby;
  if (!isRecord(lobby) || typeof lobby.lobby_id !== 'string') return null;
  if (typeof lobby.headcount !== 'number' || typeof lobby.starts_at !== 'string' || typeof lobby.open !== 'boolean') {
    return null;
  }

  return { asOf: value.as_of, lobby: lobby as DebateLobbyCard };
}

/**
 * The cached list with one patch applied, or the same list when it changes nothing. Patches only
 * update a row already listed, and only when newer than that row's `as_of`.
 */
export function applyLobbyCardPatch(list: DebateLobbiesResponse, patch: DebateLobbyCardPatch): DebateLobbiesResponse {
  const id = dashlessId(patch.lobby.lobby_id);
  const cached = list.lobbies.find(row => dashlessId(row.lobby_id) === id);
  if (!cached) return list;
  if (cached.as_of && Date.parse(cached.as_of) >= Date.parse(patch.asOf)) return list;

  const row: DebateLobbySummary = {
    ...patch.lobby,
    viewer_reminded: cached.viewer_reminded,
    viewer_on_roster: cached.viewer_on_roster,
    as_of: patch.asOf,
  };
  const others = list.lobbies.filter(other => dashlessId(other.lobby_id) !== id);

  return { lobbies: sortLobbies([...others, row]) };
}

/**
 * The same patch laid over a calendar week (GEO-3300), or the same week when it changes nothing. As
 * on the list, it only updates a row already there and newer than its `as_of`. The week keeps its
 * own order, and an ended lobby stays ended: the patch is the lobby's card, which has no end.
 */
export function applyLobbyCardPatchToCalendar(
  week: DebateLobbyCalendarResponse,
  patch: DebateLobbyCardPatch
): DebateLobbyCalendarResponse {
  const id = dashlessId(patch.lobby.lobby_id);
  let changed = false;
  const lobbies = week.lobbies.map(row => {
    if (dashlessId(row.lobby_id) !== id || row.state === 'ended') return row;
    if (row.as_of && Date.parse(row.as_of) >= Date.parse(patch.asOf)) return row;
    changed = true;
    return {
      ...patch.lobby,
      viewer_reminded: row.viewer_reminded,
      viewer_on_roster: row.viewer_on_roster,
      as_of: patch.asOf,
      state: patch.lobby.open ? ('open' as const) : ('upcoming' as const),
      closed_at: null,
    };
  });
  return changed ? { lobbies } : week;
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
