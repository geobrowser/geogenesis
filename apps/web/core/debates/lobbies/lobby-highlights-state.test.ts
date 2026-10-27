import { describe, expect, it } from 'vitest';

import type { EntityResponseIndexingState } from '~/core/hooks/use-entity-vote';

import type { DebateClaimSummary, DebateLobbyHighlights } from '../api';
import {
  type LobbyHighlightsState,
  type RoomVoteHintRequest,
  createRoomVoteHintSender,
  highlightedClaimIds,
  isNewerInstant,
  listedHighlights,
  lobbyHighlightsFromResponse,
  mergeLobbyHighlights,
  parseLobbyHighlights,
  roomVoteHintAction,
  settleFetchedLobbyHighlights,
  viewerRoomVotePosition,
} from './lobby-highlights-state';

const claim = (id: string): DebateClaimSummary => ({
  id,
  space_id: 'space',
  claim_entity_id: `entity-${id}`,
  claim: `Claim ${id}`,
  description: null,
});

function highlights(asOf: string | null, voteId: string | null = 'v1', agree = 0): DebateLobbyHighlights {
  return {
    lobby_id: 'lobby',
    as_of: asOf,
    highlights: [
      { claim: claim('b'), highlighted_by: null, highlighted_at: '2026-10-07T12:00:00Z' },
      { claim: claim('a'), highlighted_by: null, highlighted_at: '2026-10-07T11:00:00Z' },
    ],
    room_vote: voteId
      ? {
          vote_id: voteId,
          claim: claim('a'),
          started_by: null,
          started_at: '2026-10-07T12:00:00Z',
          tally: { agree, disagree: 0, eligible: 3 },
        }
      : null,
  };
}

const cached = (asOf: string | null, position: boolean | null = true): LobbyHighlightsState => ({
  ...highlights(asOf),
  viewer: { room_vote_position: position, vote_id: 'v1' },
});

describe('isNewerInstant', () => {
  it('orders microsecond stamps that share a millisecond', () => {
    expect(isNewerInstant('2026-10-07T12:00:03.120456Z', '2026-10-07T12:00:03.120455Z')).toBe(true);
    expect(isNewerInstant('2026-10-07T12:00:03.120455Z', '2026-10-07T12:00:03.120456Z')).toBe(false);
  });

  it('compares stamps written with different precision', () => {
    expect(isNewerInstant('2026-10-07T12:00:03.12Z', '2026-10-07T12:00:03.119999Z')).toBe(true);
    expect(isNewerInstant('2026-10-07T12:00:04Z', '2026-10-07T12:00:03.999999Z')).toBe(true);
    expect(isNewerInstant('2026-10-07T12:00:03.1Z', '2026-10-07T12:00:03.100000Z')).toBe(false);
  });

  it('treats a missing previous stamp as older and a missing next one as not newer', () => {
    expect(isNewerInstant('2026-10-07T12:00:03Z', null)).toBe(true);
    expect(isNewerInstant(null, '2026-10-07T12:00:03Z')).toBe(false);
    expect(isNewerInstant('nonsense', '2026-10-07T12:00:03Z')).toBe(false);
  });
});

describe('mergeLobbyHighlights', () => {
  it('takes a newer state and keeps the viewer', () => {
    const next = mergeLobbyHighlights(cached('2026-10-07T12:00:01Z'), highlights('2026-10-07T12:00:02Z', 'v1', 2));
    expect(next.room_vote?.tally.agree).toBe(2);
    expect(next.viewer).toEqual({ room_vote_position: true, vote_id: 'v1' });
  });

  it('keeps the cached state over an older or equal one', () => {
    const current = cached('2026-10-07T12:00:02Z');
    expect(mergeLobbyHighlights(current, highlights('2026-10-07T12:00:01Z', 'v1', 2))).toBe(current);
    expect(mergeLobbyHighlights(current, highlights('2026-10-07T12:00:02Z', 'v1', 2))).toBe(current);
  });
});

describe('settleFetchedLobbyHighlights', () => {
  it('keeps an event that overtook the GET, with the GET’s viewer side', () => {
    const fetched = { ...cached('2026-10-07T12:00:01Z', false), viewer: { room_vote_position: false, vote_id: 'v0' } };
    const settled = settleFetchedLobbyHighlights(cached('2026-10-07T12:00:02Z'), fetched);
    expect(settled.as_of).toBe('2026-10-07T12:00:02Z');
    expect(settled.viewer).toEqual({ room_vote_position: false, vote_id: 'v0' });
  });

  it('takes the GET otherwise', () => {
    const fetched = cached('2026-10-07T12:00:03Z', false);
    expect(settleFetchedLobbyHighlights(cached('2026-10-07T12:00:02Z'), fetched)).toBe(fetched);
    expect(settleFetchedLobbyHighlights(undefined, fetched)).toBe(fetched);
  });
});

describe('viewerRoomVotePosition', () => {
  it('answers only for the vote the GET read it for', () => {
    const state = lobbyHighlightsFromResponse({ ...highlights('t'), viewer: { room_vote_position: false } });
    expect(viewerRoomVotePosition(state)).toBe(false);
    expect(viewerRoomVotePosition({ ...state, room_vote: { ...state.room_vote!, vote_id: 'v2' } })).toBeNull();
    expect(viewerRoomVotePosition({ ...state, room_vote: null })).toBeNull();
    expect(viewerRoomVotePosition(undefined)).toBeNull();
  });
});

describe('parseLobbyHighlights', () => {
  it('reads a full state, with or without a vote', () => {
    expect(parseLobbyHighlights(highlights('2026-10-07T12:00:01.5Z'))).not.toBeNull();
    expect(parseLobbyHighlights(highlights(null, null))).not.toBeNull();
  });

  it.each([
    ['no highlights array', { ...highlights('2026-10-07T12:00:01Z'), highlights: undefined }],
    ['a bad as_of', highlights('yesterday')],
    ['a claim without its id', { ...highlights(null, null), highlights: [{ claim: { claim: 'x' } }] }],
    ['a vote without a tally', { ...highlights(null), room_vote: { ...highlights(null).room_vote, tally: {} } }],
    ['nothing', null],
  ])('refuses %s', (_label, value) => {
    expect(parseLobbyHighlights(value)).toBeNull();
  });
});

describe('listedHighlights and highlightedClaimIds', () => {
  it('leaves the voted claim to the vote card but drops it from the list below', () => {
    const state = highlights('t');
    expect(listedHighlights(state).map(highlight => highlight.claim.id)).toEqual(['b']);
    expect([...highlightedClaimIds(state)].sort()).toEqual(['a', 'b']);
    expect(listedHighlights(highlights('t', null)).map(highlight => highlight.claim.id)).toEqual(['b', 'a']);
    expect(highlightedClaimIds(undefined).size).toBe(0);
  });
});

describe('roomVoteHintAction', () => {
  const idle: EntityResponseIndexingState = { status: 'idle', pending: null, runId: null };
  const run = (
    runId: string,
    status: 'reconciling' | 'delayed' | 'indexed',
    expected: 'positive' | 'negative' | null
  ): EntityResponseIndexingState =>
    ({
      status,
      runId,
      pending: {
        entityId: 'e',
        spaceId: 's',
        personalSpaceId: 'p',
        responseKind: 'stance',
        expectedResponse: expected,
      },
    }) as EntityResponseIndexingState;

  it('hints a new write’s side as it starts, a removal as null', () => {
    expect(roomVoteHintAction(run('r1', 'reconciling', 'positive'), null)).toEqual({
      kind: 'hint',
      runId: 'r1',
      position: true,
    });
    expect(roomVoteHintAction(run('r2', 'reconciling', null), 'r1')).toEqual({
      kind: 'hint',
      runId: 'r2',
      position: null,
    });
  });

  it('does nothing more while the hinted write is on its way', () => {
    expect(roomVoteHintAction(run('r1', 'delayed', 'negative'), 'r1')).toBeNull();
    expect(roomVoteHintAction(idle, null)).toBeNull();
  });

  it('hands over once indexed, and never hints a write that was already indexed', () => {
    expect(roomVoteHintAction(run('r1', 'indexed', 'negative'), 'r1')).toEqual({ kind: 'settled' });
    expect(roomVoteHintAction(run('r9', 'indexed', 'negative'), null)).toBeNull();
  });

  it('withdraws the hint once no write is pending', () => {
    expect(roomVoteHintAction(idle, 'r2')).toEqual({ kind: 'withdraw' });
    expect(roomVoteHintAction(run('r1', 'indexed', 'positive'), 'r2')).toEqual({ kind: 'withdraw' });
  });

  it('hints an earlier pending run restored when a newer one fails', () => {
    expect(roomVoteHintAction(run('r1', 'reconciling', 'negative'), 'r2')).toEqual({
      kind: 'hint',
      runId: 'r1',
      position: false,
    });
  });
});

describe('createRoomVoteHintSender', () => {
  /** A send whose requests settle when the test says. */
  function controlledSend() {
    const calls: { request: RoomVoteHintRequest; settle: (ok: boolean) => void }[] = [];
    const send = (request: RoomVoteHintRequest) =>
      new Promise<void>((resolve, reject) =>
        calls.push({ request, settle: ok => (ok ? resolve() : reject(new Error('refused'))) })
      );
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    return { calls, send, flush, sent: () => calls.map(call => call.request) };
  }

  it('holds a newer side until the one in flight lands, then sends it', async () => {
    const { calls, send, flush, sent } = controlledSend();
    const sender = createRoomVoteHintSender(send);
    sender.request(true);
    sender.request(false);
    expect(sent()).toEqual([true]);

    calls[0]!.settle(true);
    await flush();
    expect(sent()).toEqual([true, false]);
  });

  it('collapses quick changes to the first and the latest', async () => {
    const { calls, send, flush, sent } = controlledSend();
    const sender = createRoomVoteHintSender(send);
    sender.request(true);
    sender.request(false);
    sender.request(undefined);
    sender.request(null);
    calls[0]!.settle(true);
    await flush();
    expect(sent()).toEqual([true, null]);
  });

  it('still sends the latest when the one in flight fails', async () => {
    const { calls, send, flush, sent } = controlledSend();
    const sender = createRoomVoteHintSender(send);
    sender.request(true);
    sender.request(false);
    calls[0]!.settle(false);
    await flush();
    expect(sent()).toEqual([true, false]);
  });

  it('skips a request that repeats the last one landed, but not one that failed', async () => {
    const { calls, send, flush, sent } = controlledSend();
    const sender = createRoomVoteHintSender(send);
    sender.request(true);
    calls[0]!.settle(true);
    await flush();
    sender.request(true);
    expect(sent()).toEqual([true]);

    sender.request(false);
    calls[1]!.settle(false);
    await flush();
    sender.request(false);
    expect(sent()).toEqual([true, false, false]);
  });

  it('sends a side again once geo-chat has cleared the hint itself', async () => {
    const { calls, send, flush, sent } = controlledSend();
    const sender = createRoomVoteHintSender(send);
    sender.request(true);
    calls[0]!.settle(true);
    await flush();
    sender.forget();
    sender.request(true);
    expect(sent()).toEqual([true, true]);
  });

  it('drops the queue on close, or keeps the queued request for a page going away', async () => {
    const dropped = controlledSend();
    const vote = createRoomVoteHintSender(dropped.send);
    vote.request(true);
    vote.request(undefined);
    vote.close(false);
    dropped.calls[0]!.settle(true);
    await dropped.flush();
    expect(dropped.sent()).toEqual([true]);

    const leaving = controlledSend();
    const page = createRoomVoteHintSender(leaving.send);
    page.request(true);
    page.request(false);
    page.close(true);
    page.request(null);
    leaving.calls[0]!.settle(true);
    await leaving.flush();
    expect(leaving.sent()).toEqual([true, false]);
  });
});
