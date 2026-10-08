import type { EntityResponseIndexingState } from '~/core/hooks/use-entity-vote';

import type { DebateLobbyHighlight, DebateLobbyHighlights, DebateLobbyHighlightsResponse } from '../api';

/**
 * The cached highlights. `viewer` comes from the GET only; `vote_id` says which vote its side was
 * read for, since events replace the vote without it.
 */
export type LobbyHighlightsState = DebateLobbyHighlights & {
  viewer: { room_vote_position: boolean | null; vote_id: string | null };
};

export function lobbyHighlightsFromResponse(response: DebateLobbyHighlightsResponse): LobbyHighlightsState {
  return {
    lobby_id: response.lobby_id,
    as_of: response.as_of,
    highlights: response.highlights,
    room_vote: response.room_vote,
    viewer: {
      room_vote_position: response.viewer?.room_vote_position ?? null,
      vote_id: response.room_vote?.vote_id ?? null,
    },
  };
}

/** The viewer's side on the running vote, when the GET read it for that vote. */
export function viewerRoomVotePosition(state: LobbyHighlightsState | undefined): boolean | null {
  if (!state?.room_vote || state.viewer.vote_id !== state.room_vote.vote_id) return null;
  return state.viewer.room_vote_position;
}

/**
 * `debate.lobby_highlights_changed`'s `lobby_highlights`; `null` when unreadable. Only the parts the
 * page reads are checked.
 */
export function parseLobbyHighlights(value: unknown): DebateLobbyHighlights | null {
  if (!isRecord(value) || typeof value.lobby_id !== 'string') return null;
  if (value.as_of !== null && (typeof value.as_of !== 'string' || instantParts(value.as_of) === null)) return null;
  if (!Array.isArray(value.highlights) || !value.highlights.every(isHighlight)) return null;
  const vote = value.room_vote;
  if (vote !== null) {
    if (!isRecord(vote) || typeof vote.vote_id !== 'string' || !isClaim(vote.claim)) return null;
    const tally = vote.tally;
    if (!isRecord(tally) || !['agree', 'disagree', 'eligible'].every(key => typeof tally[key] === 'number')) {
      return null;
    }
  }
  return value as DebateLobbyHighlights;
}

/**
 * `current` with `incoming` laid over it when `incoming` is newer by `as_of`; `current` itself
 * otherwise. The viewer's side is kept, tagged with the vote it was read for.
 */
export function mergeLobbyHighlights(
  current: LobbyHighlightsState,
  incoming: DebateLobbyHighlights
): LobbyHighlightsState {
  if (!isNewerInstant(incoming.as_of, current.as_of)) return current;
  return {
    lobby_id: incoming.lobby_id,
    as_of: incoming.as_of,
    highlights: incoming.highlights,
    room_vote: incoming.room_vote,
    viewer: current.viewer,
  };
}

/**
 * `incoming` over the cached copy, or, with none cached (a first GET in flight or failed), on its
 * own with the viewer's side unknown.
 */
export function withLobbyHighlights(
  current: LobbyHighlightsState | undefined,
  incoming: DebateLobbyHighlights
): LobbyHighlightsState {
  if (current) return mergeLobbyHighlights(current, incoming);
  return {
    lobby_id: incoming.lobby_id,
    as_of: incoming.as_of,
    highlights: incoming.highlights,
    room_vote: incoming.room_vote,
    viewer: { room_vote_position: null, vote_id: null },
  };
}

/**
 * A GET's result, unless the cache already holds a newer state from an event that overtook it.
 * Then the cache stands, and the GET's viewer side comes along tagged with the vote it read.
 */
export function settleFetchedLobbyHighlights(
  cached: LobbyHighlightsState | undefined,
  fetched: LobbyHighlightsState
): LobbyHighlightsState {
  if (!cached || !isNewerInstant(cached.as_of, fetched.as_of)) return fetched;
  return { ...cached, viewer: fetched.viewer };
}

/** Highlighted claims for the list: the voted one shows in the vote card instead. */
export function listedHighlights(state: DebateLobbyHighlights | undefined): DebateLobbyHighlight[] {
  if (!state) return [];
  const votedId = state.room_vote?.claim.id;
  return state.highlights.filter(highlight => highlight.claim.id !== votedId);
}

/** Every highlighted claim id, the voted one included, for lists that follow to drop. */
export function highlightedClaimIds(state: DebateLobbyHighlights | undefined): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const highlight of state?.highlights ?? []) ids.add(highlight.claim.id);
  if (state?.room_vote) ids.add(state.room_vote.claim.id);
  return ids;
}

export type RoomVoteHintAction =
  { kind: 'hint'; runId: string; position: boolean | null } | { kind: 'withdraw' } | { kind: 'settled' } | null;

/**
 * What the viewer's write on the voted claim means for their hint. Whichever run is pending is the
 * side they hold, so a run other than the hinted one is hinted, including an earlier run restored
 * when a newer one fails; a hint replaces the last. Reaching `indexed` hands over to the
 * response-indexed report; no pending run at all withdraws the hint.
 */
export function roomVoteHintAction(
  snapshot: EntityResponseIndexingState,
  hintedRunId: string | null
): RoomVoteHintAction {
  if (snapshot.runId !== null && snapshot.status !== 'indexed' && snapshot.pending) {
    if (snapshot.runId === hintedRunId) return null;
    const expected = snapshot.pending.expectedResponse;
    return { kind: 'hint', runId: snapshot.runId, position: expected === null ? null : expected === 'positive' };
  }
  if (hintedRunId === null) return null;
  if (snapshot.runId === hintedRunId) return { kind: 'settled' };
  return { kind: 'withdraw' };
}

/** A hint request: a side to PUT (`null` for a removed one), or `undefined` to DELETE. */
export type RoomVoteHintRequest = boolean | null | undefined;

/**
 * One vote's hints, one in flight at a time, latest wins: geo-chat upserts them, so concurrent
 * requests could land out of order and leave the older side counted.
 */
export function createRoomVoteHintSender(send: (request: RoomVoteHintRequest) => Promise<unknown>) {
  let inFlight = false;
  // What the server last accepted, as far as this page knows; unknown after a failure.
  let sent: { request: RoomVoteHintRequest } | null = null;
  let wanted: { request: RoomVoteHintRequest } | null = null;
  let closed = false;

  const pump = () => {
    if (inFlight || !wanted) return;
    const next = wanted;
    wanted = null;
    if (sent && sent.request === next.request) return;
    inFlight = true;
    sent = next;
    send(next.request)
      .catch(() => {
        sent = null;
      })
      .finally(() => {
        inFlight = false;
        pump();
      });
  };

  return {
    request(request: RoomVoteHintRequest) {
      if (closed) return;
      wanted = { request };
      pump();
    },
    /** geo-chat cleared the hint itself (its response-indexed report), so nothing sent still stands. */
    forget() {
      sent = null;
    },
    /** Takes no new requests. `keepQueued` still sends the queued one, for a page going away. */
    close(keepQueued: boolean) {
      closed = true;
      if (!keepQueued) wanted = null;
    },
  };
}

/**
 * True when `next` is later than `previous`. Compared to the microsecond geo-chat stamps, which
 * `Date.parse` would round to the millisecond. A missing `previous` is older than anything.
 */
export function isNewerInstant(next: string | null, previous: string | null) {
  if (next === null) return false;
  if (previous === null) return true;
  const a = instantParts(next);
  const b = instantParts(previous);
  if (!a || !b) return false;
  if (a.ms !== b.ms) return a.ms > b.ms;
  return a.fraction > b.fraction;
}

/** Whole milliseconds since the epoch, plus the sub-millisecond digits as a comparable string. */
function instantParts(value: string): { ms: number; fraction: string } | null {
  const match = /^(.+?)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!match) return null;
  const seconds = Date.parse(`${match[1]}${match[3]}`);
  if (Number.isNaN(seconds)) return null;
  const digits = (match[2] ?? '').padEnd(9, '0');
  return { ms: seconds + Number(digits.slice(0, 3)), fraction: digits.slice(3) };
}

function isHighlight(value: unknown) {
  return isRecord(value) && isClaim(value.claim) && typeof value.highlighted_at === 'string';
}

function isClaim(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.space_id === 'string' &&
    typeof value.claim_entity_id === 'string' &&
    typeof value.claim === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
