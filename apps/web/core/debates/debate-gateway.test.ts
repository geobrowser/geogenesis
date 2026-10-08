import { CancelledError, QueryClient, QueryObserver } from '@tanstack/react-query';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError, getStoredGeoChatAccessToken, resetGeoChatSession } from './api';
import { DebateGatewayClient, type DebateGatewaySession } from './debate-gateway';

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, resetGeoChatSession: vi.fn(), getStoredGeoChatAccessToken: vi.fn(() => null) };
});

type MessageHandler = (event: { data: unknown }) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onmessage: MessageHandler | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {}

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(op: string, payload: unknown, seq?: number) {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          v: 1,
          op,
          seq: seq ?? null,
          request_id: null,
          space_id: null,
          room_id: null,
          room_kind: null,
          payload,
        }),
      })
    );
  }

  receiveRaw(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  serverClose() {
    this.close();
  }

  send(value: string) {
    this.sent.push(JSON.parse(value) as Record<string, unknown>);
  }
}

describe('DebateGatewayClient', () => {
  let sockets: FakeWebSocket[];
  let queryClient: QueryClient;
  let invalidateQueries: ReturnType<typeof vi.spyOn>;
  let session: DebateGatewaySession;
  let getSession: ReturnType<
    typeof vi.fn<
      (
        getPrivyIdentityToken: () => Promise<string | null | undefined>,
        accountKey: string
      ) => Promise<DebateGatewaySession>
    >
  >;
  let client: DebateGatewayClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    sockets = [];
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    session = {
      access_token: 'access token',
      refresh_token: 'refresh-token',
      expires_at: '2026-07-20T12:10:00.000Z',
    };
    getSession = vi.fn(async () => session);
    client = new DebateGatewayClient({
      queryClient,
      getSession,
      getApiBaseUrl: () => 'https://chat.example.com/',
      createWebSocket: url => {
        const socket = new FakeWebSocket(url);
        sockets.push(socket);
        return socket;
      },
      random: () => 0,
    });
  });

  afterEach(() => {
    client.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('authenticates, reference-counts scopes, and reconciles the subscribe/READY race', async () => {
    const releaseFirst = client.retainScope({ scope: 'space', space_id: 'space-1' });
    const releaseSecond = client.retainScope({ scope: 'space', space_id: 'space-1' });

    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();

    expect(sockets[0]?.url).toBe('wss://chat.example.com/gateway/ws?access_token=access+token');
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    expect(sockets[0]!.sent).toContainEqual(
      expect.objectContaining({ op: 'SUBSCRIBE', payload: { scope: 'space', space_id: 'space-1' } })
    );

    sockets[0]!.receive('READY', readyPayload([{ scope: 'space', space_id: 'space-1' }]));
    await flushInvalidations();

    expectInvalidated(invalidateQueries, { queryKey: ['debates', 'claims', 'space-1'], refetchType: 'active' });
    expectInvalidated(invalidateQueries, { queryKey: ['debates', 'space', 'space-1'], refetchType: 'active' });

    releaseFirst();
    expect(sockets[0]!.sent.some(message => message.op === 'UNSUBSCRIBE')).toBe(false);
    releaseSecond();
    expect(sockets[0]!.sent).toContainEqual(
      expect.objectContaining({ op: 'UNSUBSCRIBE', payload: { scope: 'space', space_id: 'space-1' } })
    );
  });

  it('deduplicates events and coalesces invalidations across adjacent gateway messages', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    expectBroadInvalidated(invalidateQueries);
    invalidateQueries.mockClear();

    const event = {
      event_id: 'event-1',
      event_type: 'debate.media_changed',
      payload: { debate_id: 'debate-1', space_id: 'space-1' },
    };
    sockets[0]!.receive('EVENT', event, 1);
    sockets[0]!.receive('EVENT', event, 2);
    await vi.advanceTimersByTimeAsync(25);
    sockets[0]!.receive('EVENT', { ...event, event_id: 'event-2' }, 3);
    await vi.advanceTimersByTimeAsync(25);

    expect(invalidateQueries.mock.calls).toEqual(
      expect.arrayContaining([
        [
          { queryKey: ['debates', 'media', 'debate-1'], refetchType: 'active' },
          { throwOnError: true, cancelRefetch: false },
        ],
        [
          { queryKey: ['debates', 'detail', 'debate-1'], refetchType: 'active' },
          { throwOnError: true, cancelRefetch: false },
        ],
        [
          { queryKey: ['debates', 'transcript', 'debate-1'], refetchType: 'active' },
          { throwOnError: true, cancelRefetch: false },
        ],
        [
          { queryKey: ['debates', 'space', 'space-1'], refetchType: 'active' },
          { throwOnError: true, cancelRefetch: false },
        ],
      ])
    );
    expect(invalidateQueries).toHaveBeenCalledTimes(4);
  });

  it.each([
    [
      'activity',
      { event_type: 'debate.activity_changed', payload: {} },
      [
        ['debates', 'account', 'user-a', 'activity'],
        ['debates', 'account', 'user-a', 'profile'],
      ],
    ],
    [
      'state',
      { event_type: 'debate.state_changed', payload: { debate_id: 'debate-1', space_id: 'space-1' } },
      [
        ['debates', 'detail', 'debate-1'],
        ['debates', 'space', 'space-1'],
        ['debates', 'account', 'user-a', 'activity'],
        ['debates', 'account', 'user-a', 'profile'],
      ],
    ],
    [
      'rematch',
      { event_type: 'debate.rematch_changed', payload: { rematch_session_id: 'rematch-1' } },
      [
        ['debates', 'account', 'user-a', 'rematch', 'rematch-1'],
        ['debates', 'account', 'user-a', 'activity'],
        ['debates', 'account', 'user-a', 'profile'],
      ],
    ],
    [
      'share prompts',
      { event_type: 'debate.share_prompts_changed', payload: {} },
      [['debates', 'account', 'user-a', 'share-prompts']],
    ],
    [
      'requests',
      { event_type: 'debate.requests_changed', payload: {} },
      [
        ['debates', 'account', 'user-a', 'requests'],
        ['debates', 'account', 'user-a', 'scheduled-debates'],
        ['debates', 'account', 'user-a', 'upcoming-rooms'],
        ['debates', 'account', 'user-a', 'room'],
        ['debates', 'account', 'user-a', 'activity'],
        ['debates', 'account', 'user-a', 'profile'],
      ],
    ],
    [
      'matchmaking sections',
      { event_type: 'debate.matchmaking_changed', payload: { sections: ['people', 'matches'] } },
      [
        ['debates', 'account', 'user-a', 'people'],
        ['debates', 'account', 'user-a', 'matches'],
      ],
    ],
    [
      'matchmaking without sections',
      { event_type: 'debate.matchmaking_changed', payload: {} },
      [
        ['debates', 'account', 'user-a', 'people'],
        ['debates', 'account', 'user-a', 'matchmaking-claims'],
        ['debates', 'account', 'user-a', 'matches'],
      ],
    ],
    [
      'lobby list',
      { event_type: 'debate.lobbies_changed', payload: { lobby_id: 'abc' } },
      [
        ['debates', 'account', 'user-a', 'lobbies'],
        ['debates', 'account', 'user-a', 'lobby', 'abc'],
      ],
    ],
    [
      'own lobby standing',
      { event_type: 'debate.my_lobby_changed', payload: { lobby_id: 'AB-C' } },
      [
        ['debates', 'account', 'user-a', 'lobbies'],
        ['debates', 'account', 'user-a', 'my-lobby'],
        ['debates', 'account', 'user-a', 'lobby', 'abc'],
      ],
    ],
    ['an unknown type, which it ignores', { event_type: 'debate.later_changed', payload: { lobby_id: 'abc' } }, []],
    [
      'one lobby',
      { event_type: 'debate.lobby_changed', payload: { lobby_id: 'AB-CD' } },
      [
        ['debates', 'account', 'user-a', 'lobby', 'abcd'],
        ['debates', 'account', 'user-a', 'lobby-claims', 'abcd'],
      ],
    ],
    [
      'one lobby’s claims only',
      { event_type: 'debate.lobby_changed', payload: { lobby_id: 'AB-CD', sections: ['claims'] } },
      [['debates', 'account', 'user-a', 'lobby-claims', 'abcd']],
    ],
  ])('maps %s events to their authoritative query families', async (_label, event, expectedKeys) => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    invalidateQueries.mockClear();

    sockets[0]!.receive('EVENT', { event_id: `event-${String(_label)}`, ...event });
    await flushInvalidations();

    for (const queryKey of expectedKeys) {
      expectInvalidated(invalidateQueries, { queryKey, refetchType: 'active' });
    }
    expect(invalidateQueries).toHaveBeenCalledTimes(expectedKeys.length);
  });

  describe('lobby card patches', () => {
    const lobbiesKey = ['debates', 'account', 'user-a', 'lobbies'];
    const myLobbyKey = ['debates', 'account', 'user-a', 'my-lobby'];
    const row = (lobbyId: string, headcount: number, asOf: string | null = null, viewerReminded = false) => ({
      lobby_id: lobbyId,
      name: lobbyId,
      scheduled: false,
      starts_at: '2026-10-07T12:00:00Z',
      opens_at: '2026-10-07T12:00:00Z',
      open: true,
      hosts: [],
      headcount,
      avatars: [],
      debating_count: 0,
      reminder_count: 0,
      viewer_reminded: viewerReminded,
      viewer_on_roster: false,
      as_of: asOf,
    });
    const card = (lobbyId: string, headcount: number, asOf: string) => {
      const { viewer_reminded: _r, viewer_on_roster: _o, as_of: _a, ...lobby } = row(lobbyId, headcount);
      return { status: 'listed', as_of: asOf, lobby };
    };

    async function started() {
      client.start(
        vi.fn(async () => 'privy-token'),
        'user-a'
      );
      await vi.runAllTicks();
      sockets[0]!.open();
      sockets[0]!.receive('READY', readyPayload([]));
      await flushInvalidations();
      invalidateQueries.mockClear();
    }

    let eventCount = 0;
    async function lobbiesChanged(payload: Record<string, unknown>) {
      eventCount += 1;
      sockets[0]!.receive('EVENT', {
        event_id: `lobbies-${eventCount}`,
        event_type: 'debate.lobbies_changed',
        payload,
      });
      await flushInvalidations();
    }

    const cachedIds = () =>
      queryClient
        .getQueryData<{ lobbies: { lobby_id: string; headcount: number }[] }>(lobbiesKey)
        ?.lobbies.map(lobby => `${lobby.lobby_id}:${lobby.headcount}`);

    it('patches a cached row without refetching, keeping the viewer’s own fields', async () => {
      await started();
      queryClient.setQueryData(lobbiesKey, { lobbies: [row('aa', 3, null, true), row('bb', 2)] });

      await lobbiesChanged({ lobby_id: 'bb', lobby_card: card('bb', 5, '2026-10-07T12:00:01Z') });

      expect(cachedIds()).toEqual(['bb:5', 'aa:3']);
      expect(
        queryClient.getQueryData<{ lobbies: { viewer_reminded: boolean }[] }>(lobbiesKey)?.lobbies[1]
      ).toMatchObject({ viewer_reminded: true });
      expect(invalidateQueries).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: lobbiesKey }));
      expect(invalidateQueries).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: myLobbyKey }));
      expectInvalidated(invalidateQueries, {
        queryKey: [...lobbiesKey.slice(0, 3), 'lobby', 'bb'],
        refetchType: 'active',
      });
    });

    it('drops a patch no newer than the row, whether the GET or a patch set it', async () => {
      await started();
      queryClient.setQueryData(lobbiesKey, { lobbies: [row('aa', 3, '2026-10-07T12:00:04Z')] });

      await lobbiesChanged({ lobby_id: 'aa', lobby_card: card('aa', 9, '2026-10-07T12:00:04Z') });
      expect(cachedIds()).toEqual(['aa:3']);

      await lobbiesChanged({ lobby_id: 'aa', lobby_card: card('aa', 6, '2026-10-07T12:00:05Z') });
      await lobbiesChanged({ lobby_id: 'aa', lobby_card: card('aa', 4, '2026-10-07T12:00:02Z') });
      expect(cachedIds()).toEqual(['aa:6']);
    });

    it('never adds a lobby from a patch', async () => {
      await started();
      queryClient.setQueryData(lobbiesKey, { lobbies: [row('aa', 3)] });

      await lobbiesChanged({ lobby_id: 'bb', lobby_card: card('bb', 1, '2026-10-07T12:00:01Z') });

      expect(cachedIds()).toEqual(['aa:3']);
      expect(invalidateQueries).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: lobbiesKey }));
    });

    /** A list GET per call: each resolves with its response when released, in call order. */
    function slowLobbyFetches(responses: object[]) {
      const releases: (() => void)[] = [];
      const fetchLobbies = vi.fn(() => {
        const response = responses[Math.min(fetchLobbies.mock.calls.length - 1, responses.length - 1)]!;
        return new Promise<object>(done => releases.push(() => done(response)));
      });
      return { fetchLobbies, release: (index: number) => releases[index]!() };
    }

    it('keeps a patch that lands during a GET when the older GET arrives, without asking again', async () => {
      await started();
      invalidateQueries.mockRestore();
      const { fetchLobbies, release } = slowLobbyFetches([{ lobbies: [row('aa', 3, '2026-10-07T12:00:01Z')] }]);
      const observer = new QueryObserver(queryClient, { queryKey: lobbiesKey, queryFn: fetchLobbies });
      const unsubscribe = observer.subscribe(() => undefined);
      release(0);
      await vi.waitFor(() => expect(cachedIds()).toEqual(['aa:3']));

      void observer.refetch();
      await lobbiesChanged({ lobby_id: 'aa', lobby_card: card('aa', 8, '2026-10-07T12:00:05Z') });
      expect(cachedIds()).toEqual(['aa:8']);
      release(1);

      await vi.waitFor(() => expect(fetchLobbies).toHaveBeenCalledTimes(2));
      await vi.runAllTicks();
      expect(cachedIds()).toEqual(['aa:8']);
      unsubscribe();
    });

    it('applies a patch that lands during the first load once the list arrives', async () => {
      await started();
      invalidateQueries.mockRestore();
      const { fetchLobbies, release } = slowLobbyFetches([{ lobbies: [row('aa', 3, '2026-10-07T12:00:01Z')] }]);
      const observer = new QueryObserver(queryClient, { queryKey: lobbiesKey, queryFn: fetchLobbies });
      const unsubscribe = observer.subscribe(() => undefined);

      await lobbiesChanged({ lobby_id: 'aa', lobby_card: card('aa', 8, '2026-10-07T12:00:05Z') });
      release(0);

      await vi.waitFor(() => expect(cachedIds()).toEqual(['aa:8']));
      expect(fetchLobbies).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('does not cancel a slow GET for a stream of patches, and drops held patches the GET has caught up with', async () => {
      await started();
      invalidateQueries.mockRestore();
      const { fetchLobbies, release } = slowLobbyFetches([
        { lobbies: [row('aa', 3, '2026-10-07T12:00:01Z')] },
        { lobbies: [row('aa', 6, '2026-10-07T12:00:04Z')] },
        { lobbies: [row('aa', 2, '2026-10-07T12:00:09Z')] },
      ]);
      const observer = new QueryObserver(queryClient, { queryKey: lobbiesKey, queryFn: fetchLobbies });
      const unsubscribe = observer.subscribe(() => undefined);
      release(0);
      await vi.waitFor(() => expect(cachedIds()).toEqual(['aa:3']));

      void observer.refetch();
      for (const [headcount, second] of [
        [4, 2],
        [5, 3],
        [7, 5],
      ] as const) {
        await lobbiesChanged({ lobby_id: 'aa', lobby_card: card('aa', headcount, `2026-10-07T12:00:0${second}Z`) });
      }
      release(1);
      await vi.waitFor(() => expect(fetchLobbies).toHaveBeenCalledTimes(2));
      await vi.runAllTicks();
      // The GET read the lobby at :04; the patch from :05 is newer and stays on top.
      expect(cachedIds()).toEqual(['aa:7']);

      void observer.refetch();
      release(2);
      await vi.waitFor(() => expect(cachedIds()).toEqual(['aa:2']));
      expect(fetchLobbies).toHaveBeenCalledTimes(3);
      unsubscribe();
    });

    it.each([
      ['no lobby_card', {}],
      ['another status', { lobby_card: { status: 'removed', as_of: '2026-10-07T12:00:01Z' } }],
      ['a card without as_of', { lobby_card: { ...card('aa', 1, ''), as_of: undefined } }],
    ])('refetches the list, not the viewer’s own lobby, for %s', async (_label, extra) => {
      await started();
      queryClient.setQueryData(lobbiesKey, { lobbies: [row('aa', 3)] });

      await lobbiesChanged({ lobby_id: 'aa', ...extra });

      expectInvalidated(invalidateQueries, { queryKey: lobbiesKey, refetchType: 'active' });
      expect(invalidateQueries).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: myLobbyKey }));
      expect(cachedIds()).toEqual(['aa:3']);
    });

    it('leaves the lobby page to debate.lobby_changed while the viewer is connected there', async () => {
      await started();
      const lobbyKey = [...lobbiesKey.slice(0, 3), 'lobby', 'aa'];
      queryClient.setQueryData(lobbiesKey, { lobbies: [row('aa', 3)] });
      queryClient.setQueryData(lobbyKey, { viewer: { connected: true } });

      await lobbiesChanged({ lobby_id: 'aa', lobby_card: card('aa', 4, '2026-10-07T12:00:01Z') });
      expect(invalidateQueries).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: lobbyKey }));

      queryClient.setQueryData(lobbyKey, { viewer: { connected: false } });
      await lobbiesChanged({ lobby_id: 'aa', lobby_card: card('aa', 5, '2026-10-07T12:00:02Z') });
      expectInvalidated(invalidateQueries, { queryKey: lobbyKey, refetchType: 'active' });
    });
  });

  describe('lobby highlights', () => {
    const highlightsKey = ['debates', 'account', 'user-a', 'lobby-highlights', 'abcd'];
    const state = (asOf: string | null, agree: number) => ({
      lobby_id: 'AB-CD',
      as_of: asOf,
      highlights: [],
      room_vote: {
        vote_id: 'v1',
        claim: { id: 'c1', space_id: 's', claim_entity_id: 'e', claim: 'Claim', description: null },
        started_by: null,
        started_at: '2026-10-07T12:00:00Z',
        tally: { agree, disagree: 0, eligible: 4 },
      },
    });

    async function started() {
      client.start(
        vi.fn(async () => 'privy-token'),
        'user-a'
      );
      await vi.runAllTicks();
      sockets[0]!.open();
      sockets[0]!.receive('READY', readyPayload([]));
      await flushInvalidations();
      invalidateQueries.mockClear();
    }

    let eventCount = 0;
    async function highlightsChanged(lobbyHighlights: unknown) {
      eventCount += 1;
      sockets[0]!.receive('EVENT', {
        event_id: `highlights-${eventCount}`,
        event_type: 'debate.lobby_highlights_changed',
        payload: { lobby_id: 'AB-CD', lobby_highlights: lobbyHighlights },
      });
      await flushInvalidations();
    }

    const cachedAgree = () =>
      queryClient.getQueryData<{ room_vote: { tally: { agree: number } } }>(highlightsKey)?.room_vote.tally.agree;

    it('replaces the cached state with a newer one, keeping the viewer, and never refetches', async () => {
      await started();
      queryClient.setQueryData(highlightsKey, {
        ...state('2026-10-07T12:00:01.000100Z', 1),
        viewer: { room_vote_position: true, vote_id: 'v1' },
      });

      await highlightsChanged(state('2026-10-07T12:00:01.000200Z', 2));

      expect(cachedAgree()).toBe(2);
      expect(queryClient.getQueryData<{ viewer: unknown }>(highlightsKey)?.viewer).toEqual({
        room_vote_position: true,
        vote_id: 'v1',
      });
      expect(invalidateQueries).not.toHaveBeenCalled();
    });

    it.each([
      ['an older state', state('2026-10-07T12:00:00.9Z', 5)],
      ['the same state', state('2026-10-07T12:00:01.0001Z', 5)],
      ['an unreadable payload', { lobby_id: 'AB-CD' }],
    ])('ignores %s', async (_label, payload) => {
      await started();
      queryClient.setQueryData(highlightsKey, {
        ...state('2026-10-07T12:00:01.000100Z', 1),
        viewer: { room_vote_position: null, vote_id: 'v1' },
      });

      await highlightsChanged(payload);

      expect(cachedAgree()).toBe(1);
      expect(invalidateQueries).not.toHaveBeenCalled();
    });

    it('leaves a lobby whose highlights were never read uncached', async () => {
      await started();
      await highlightsChanged(state('2026-10-07T12:00:01Z', 1));
      expect(queryClient.getQueryData(highlightsKey)).toBeUndefined();
    });
  });

  it('subscribes to the matchmaking scope and reconciles every hub query on confirmation', async () => {
    const release = client.retainScope({ scope: 'matchmaking' });

    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    expect(sockets[0]!.sent).toContainEqual(
      expect.objectContaining({ op: 'SUBSCRIBE', payload: { scope: 'matchmaking' } })
    );
    invalidateQueries.mockClear();

    sockets[0]!.receive('READY', readyPayload([{ scope: 'matchmaking' }]));
    await flushInvalidations();

    for (const kind of ['people', 'matchmaking-claims', 'matches', 'lobbies', 'lobby', 'lobby-claims']) {
      expectInvalidated(invalidateQueries, {
        queryKey: ['debates', 'account', 'user-a', kind],
        refetchType: 'active',
      });
    }

    release();
    expect(sockets[0]!.sent).toContainEqual(
      expect.objectContaining({ op: 'UNSUBSCRIBE', payload: { scope: 'matchmaking' } })
    );
  });

  it('exposes the advertised capabilities so surfaces can detect matchmaking support', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    expect(client.getSnapshot().capabilities).toEqual([]);

    sockets[0]!.receive('READY', {
      ...readyPayload([]),
      capabilities: ['debate_invalidations_v1', 'debate_matchmaking_v1'],
    });
    await flushInvalidations();

    expect(client.getSnapshot().capabilities).toEqual(['debate_invalidations_v1', 'debate_matchmaking_v1']);

    client.stop();
    expect(client.getSnapshot().capabilities).toEqual([]);
  });

  it('filters claim invalidations to active claim queries that intersect the event', async () => {
    queryClient.setQueryData(['debates', 'claims', 'space-1', ['claim-1']], {});
    queryClient.setQueryData(['debates', 'claims', 'space-1', ['claim-2']], {});
    queryClient.setQueryData(['claim-response-summaries', 'profile-1', 'space-1', ['claim-1:stance']], new Map());
    queryClient.setQueryData(['claim-response-summaries', 'profile-1', 'space-1', ['claim-2:stance']], new Map());
    queryClient.setQueryData(['claim-response-summary-data', 'profile-1', 'space-1', ['claim-2:stance']], new Map());
    queryClient.setQueryData(['claim-response-summaries', 'profile-1', 'space-2', ['claim-2:stance']], new Map());
    queryClient.setQueryData(['debates', 'account', 'user-a', 'rematch', 'session-1', 'claims', ['claim-9']], {});
    queryClient.setQueryData(['debates', 'account', 'user-a', 'rematch', 'session-1', 'claims', ['claim-2']], {});
    queryClient.setQueryData(['debates', 'account', 'user-a', 'rematch', 'session-1', 'claims', []], {});
    queryClient.setQueryData(['participant-positions', ['profile-1', 'profile-2']], []);
    const refetchQueries = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue();

    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    invalidateQueries.mockClear();
    sockets[0]!.receive('EVENT', {
      event_id: 'event-claims',
      event_type: 'debate.claims_changed',
      payload: { space_id: 'space-1', claim_entity_ids: ['claim-2'] },
    });
    await flushInvalidations();

    type InvalidationFilters = NonNullable<Parameters<QueryClient['invalidateQueries']>[0]>;
    const invalidationCalls = invalidateQueries.mock.calls as unknown as Array<[InvalidationFilters]>;
    const predicate = invalidationCalls.map(call => call[0]).find(filters => 'predicate' in filters)?.predicate;
    expect(predicate).toBeTypeOf('function');
    expect(
      predicate!(queryClient.getQueryCache().find({ queryKey: ['debates', 'claims', 'space-1', ['claim-1']] })!)
    ).toBe(false);
    expect(
      predicate!(queryClient.getQueryCache().find({ queryKey: ['debates', 'claims', 'space-1', ['claim-2']] })!)
    ).toBe(true);
    expect(
      predicate!(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['claim-response-summaries', 'profile-1', 'space-1', ['claim-1:stance']] })!
      )
    ).toBe(false);
    expect(
      predicate!(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['claim-response-summaries', 'profile-1', 'space-1', ['claim-2:stance']] })!
      )
    ).toBe(true);
    expect(
      predicate!(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['claim-response-summary-data', 'profile-1', 'space-1', ['claim-2:stance']] })!
      )
    ).toBe(true);
    // The rematch picker draws both participants' sides, so a claim change has to reach the batch
    // holding that claim — the opponent's response is what it's waiting on. Batches that don't hold
    // it learn nothing from the event and must stay put: refreshing them all cancelled every
    // in-flight batch on each event and none ever landed.
    expect(
      predicate!(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['debates', 'account', 'user-a', 'rematch', 'session-1', 'claims', ['claim-9']] })!
      )
    ).toBe(false);
    expect(
      predicate!(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['debates', 'account', 'user-a', 'rematch', 'session-1', 'claims', ['claim-2']] })!
      )
    ).toBe(true);
    // The id-less query is the session's own list; any response can add a row to it.
    expect(
      predicate!(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['debates', 'account', 'user-a', 'rematch', 'session-1', 'claims', []] })!
      )
    ).toBe(true);
    expect(
      predicate!(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['claim-response-summaries', 'profile-1', 'space-2', ['claim-2:stance']] })!
      )
    ).toBe(false);
    // The rematch picker reads both participants' sides straight from the graph in one query;
    // any response in a watched space may be one of theirs, so it re-asks.
    expect(
      predicate!(queryClient.getQueryCache().find({ queryKey: ['participant-positions', ['profile-1', 'profile-2']] })!)
    ).toBe(true);
    expect(refetchQueries).not.toHaveBeenCalled();
  });

  it('coalesces adjacent claim events into one active summary-data refresh', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    invalidateQueries.mockRestore();

    const responseTargets = ['claim-1:stance', 'claim-2:stance'];
    const summaryDataKey = ['claim-response-summary-data', 'profile-1', 'space-1', responseTargets] as const;
    const responseBatchKey = ['claim-response-summaries', 'profile-1', 'space-1', responseTargets] as const;
    const fetchSummaryData = vi.fn(async () => new Map([['claim-2:stance', { negative: 1 }]]));
    const observer = new QueryObserver(queryClient, {
      queryKey: responseBatchKey,
      queryFn: () =>
        queryClient.fetchQuery({
          queryKey: summaryDataKey,
          queryFn: fetchSummaryData,
          staleTime: 30_000,
        }),
      staleTime: 30_000,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.refetch();
    expect(fetchSummaryData).toHaveBeenCalledOnce();

    sockets[0]!.receive('EVENT', {
      event_id: 'event-response-summary',
      event_type: 'debate.claims_changed',
      payload: { space_id: 'space-1', claim_entity_ids: ['claim-2'] },
    });
    sockets[0]!.receive('EVENT', {
      event_id: 'event-response-summary-adjacent',
      event_type: 'debate.claims_changed',
      payload: { space_id: 'space-1', claim_entity_ids: ['claim-1'] },
    });
    await flushInvalidations();
    await vi.runAllTicks();

    expect(fetchSummaryData).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('broadly reconciles debate and active claim response batches', async () => {
    queryClient.setQueryData(['debates', 'claims', 'space-1', ['claim-1']], {});
    queryClient.setQueryData(['claim-response-summaries', 'profile-1', 'space-1', ['claim-1:stance']], new Map());
    queryClient.setQueryData(['claim-response-summary-data', 'profile-1', 'space-1', ['claim-1:stance']], new Map());
    queryClient.setQueryData(['unrelated', 'space-1'], {});

    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    type InvalidationFilters = NonNullable<Parameters<QueryClient['invalidateQueries']>[0]>;
    const invalidationCalls = invalidateQueries.mock.calls as unknown as Array<[InvalidationFilters]>;
    const predicate = invalidationCalls.map(call => call[0]).find(filters => 'predicate' in filters)?.predicate;
    expect(predicate).toBeTypeOf('function');
    expect(
      predicate!(queryClient.getQueryCache().find({ queryKey: ['debates', 'claims', 'space-1', ['claim-1']] })!)
    ).toBe(true);
    expect(
      predicate!(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['claim-response-summaries', 'profile-1', 'space-1', ['claim-1:stance']] })!
      )
    ).toBe(true);
    expect(
      predicate!(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['claim-response-summary-data', 'profile-1', 'space-1', ['claim-1:stance']] })!
      )
    ).toBe(true);
    expect(predicate!(queryClient.getQueryCache().find({ queryKey: ['unrelated', 'space-1'] })!)).toBe(false);
  });

  it('refetches an active response batch during broad reconnect reconciliation', async () => {
    invalidateQueries.mockRestore();
    const responseTargets = ['claim-1:stance'];
    const summaryDataKey = ['claim-response-summary-data', 'profile-1', 'space-1', responseTargets] as const;
    const responseBatchKey = ['claim-response-summaries', 'profile-1', 'space-1', responseTargets] as const;
    const fetchSummaryData = vi.fn(async () => new Map([['claim-1:stance', { positive: 1 }]]));
    const observer = new QueryObserver(queryClient, {
      queryKey: responseBatchKey,
      queryFn: () =>
        queryClient.fetchQuery({
          queryKey: summaryDataKey,
          queryFn: fetchSummaryData,
          staleTime: 30_000,
        }),
      staleTime: 30_000,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.refetch();
    expect(fetchSummaryData).toHaveBeenCalledOnce();

    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    await vi.runAllTicks();

    expect(fetchSummaryData).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('sends presence heartbeats and reconnects after two missed acknowledgements', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('HELLO', { heartbeat_interval_ms: 1_000 });
    sockets[0]!.receive('READY', readyPayload([]));

    expect(sockets[0]!.sent).toContainEqual(
      expect.objectContaining({ op: 'HEARTBEAT', payload: { debate_presence: true } })
    );

    await vi.advanceTimersByTimeAsync(2_000);
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    expect(client.getSnapshot().paused).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
  });

  it('sends the current inactive presence without disconnecting the gateway', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a',
      false
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('HELLO', { heartbeat_interval_ms: 1_000 });

    expect(sockets[0]!.sent).toContainEqual(
      expect.objectContaining({ op: 'HEARTBEAT', payload: { debate_presence: false } })
    );

    sockets[0]!.receive('HEARTBEAT_ACK', {});
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets[0]!.sent.at(-1)).toEqual(
      expect.objectContaining({ op: 'HEARTBEAT', payload: { debate_presence: false } })
    );
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
  });

  it('coalesces rapid attention changes behind an outstanding heartbeat and preserves the final state', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a',
      true
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('HELLO', { heartbeat_interval_ms: 1_000 });
    const initialHeartbeatCount = sockets[0]!.sent.filter(message => message.op === 'HEARTBEAT').length;

    client.setDebatePresence(false);
    client.setDebatePresence(true);
    client.setDebatePresence(false);
    expect(sockets[0]!.sent.filter(message => message.op === 'HEARTBEAT')).toHaveLength(initialHeartbeatCount);

    sockets[0]!.receive('HEARTBEAT_ACK', {});
    expect(sockets[0]!.sent.at(-1)).toEqual(
      expect.objectContaining({ op: 'HEARTBEAT', payload: { debate_presence: false } })
    );
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);

    sockets[0]!.receive('HEARTBEAT_ACK', {});
    client.setDebatePresence(true);
    expect(sockets[0]!.sent.at(-1)).toEqual(
      expect.objectContaining({ op: 'HEARTBEAT', payload: { debate_presence: true } })
    );
  });

  // GEO-3028. Tab visibility travels beside presence, with no grace, so switching tabs takes
  // someone off other people's lists at once. Until it is reported it is left off the heartbeat
  // entirely, which geo-chat reads as "unknown", never as "hidden".
  it('reports tab visibility beside presence, at once, and only once it is known', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a',
      true
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('HELLO', { heartbeat_interval_ms: 1_000 });
    expect(sockets[0]!.sent.at(-1)).toEqual(
      expect.objectContaining({ op: 'HEARTBEAT', payload: { debate_presence: true } })
    );

    sockets[0]!.receive('HEARTBEAT_ACK', {});
    client.setTabVisible(false);
    expect(sockets[0]!.sent.at(-1)).toEqual(
      expect.objectContaining({ op: 'HEARTBEAT', payload: { debate_presence: true, debate_visible: false } })
    );

    // Behind an unacknowledged heartbeat it coalesces like presence does, keeping the final state.
    client.setTabVisible(true);
    client.setTabVisible(false);
    client.setTabVisible(true);
    sockets[0]!.receive('HEARTBEAT_ACK', {});
    expect(sockets[0]!.sent.at(-1)).toEqual(
      expect.objectContaining({ op: 'HEARTBEAT', payload: { debate_presence: true, debate_visible: true } })
    );
  });

  it('resets missed acknowledgements and keeps the live socket connected', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('HELLO', { heartbeat_interval_ms: 1_000 });
    sockets[0]!.receive('READY', readyPayload([]));

    await vi.advanceTimersByTimeAsync(900);
    sockets[0]!.receive('HEARTBEAT_ACK', {});
    await vi.advanceTimersByTimeAsync(1_100);

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
  });

  it('uses bounded exponential reconnects and broadly reconciles after reconnect or lag', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    invalidateQueries.mockClear();

    sockets[0]!.serverClose();
    expect(client.getSnapshot().paused).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);

    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    expectBroadInvalidated(invalidateQueries);

    invalidateQueries.mockClear();
    sockets[1]!.receive('ERROR', { code: 'events_lagged', message: 'events skipped' });
    await flushInvalidations();
    expectBroadInvalidated(invalidateQueries);
  });

  it('abandons a socket that never completes the protocol handshake', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();

    await vi.advanceTimersByTimeAsync(9_999);
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CONNECTING);
    await vi.advanceTimersByTimeAsync(1);

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    expect(client.getSnapshot()).toMatchObject({ status: 'degraded', paused: true });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
  });

  it('reconnects when an authoritative invalidation refetch fails', async () => {
    invalidateQueries.mockRejectedValueOnce(new Error('snapshot unavailable'));
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    expect(client.getSnapshot()).toMatchObject({ status: 'degraded', paused: true });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
  });

  // The participants' positions come from the knowledge graph; its failing says nothing about the
  // geo-chat socket, and the query polls on its own.
  it('keeps a healthy socket open when the graph-side positions refetch fails', async () => {
    invalidateQueries.mockRejectedValueOnce(
      Object.assign(new Error('graphql request failed'), { _tag: 'GraphqlRequestError' })
    );
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(1);
  });

  it('keeps a healthy socket open when an invalidated query fails with a deterministic 4xx', async () => {
    invalidateQueries.mockRejectedValueOnce(
      new GeoChatRequestError('at most 50 claim IDs may be requested', 'too_many_claim_ids', 400)
    );
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(1);
  });

  it('retries the invalidation instead of the socket when a refetch is rate limited', async () => {
    invalidateQueries.mockRejectedValueOnce(new GeoChatRequestError('slow down', 'rate_limited', 429));
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    // A 429 says nothing about the socket, and the affected queries use `retry: false` — nothing
    // else would refetch them if this flush gave up.
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
    const callsBeforeRetry = invalidateQueries.mock.calls.length;
    await vi.advanceTimersByTimeAsync(250);
    expect(invalidateQueries.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });
    expect(sockets).toHaveLength(1);
    expect(resetGeoChatSession).not.toHaveBeenCalled();
  });

  it('keeps every failed batch retry rather than replacing one with the next', async () => {
    // Two flushes fail transiently a moment apart. Replacing the first retry with the second would
    // drop the first batch's filters, and with `retry: false` nothing else refetches them.
    invalidateQueries.mockRejectedValue(new GeoChatRequestError('slow down', 'rate_limited', 429));
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    sockets[0]!.receive('EVENT', {
      event_id: 'event-a',
      event_type: 'debate.claims_changed',
      payload: { space_id: 'space-1', claim_entity_ids: ['claim-1'] },
    });
    await flushInvalidations();
    const flushCount = invalidateQueries.mock.calls.length;
    // The READY flush is one broad invalidation, the claim event one scoped invalidation.
    expect(flushCount).toBe(2);

    // Both retries fire on their own backoff; the first flush's retry was not lost to the second.
    await vi.advanceTimersByTimeAsync(300);
    expect(invalidateQueries.mock.calls.length).toBe(flushCount + 2);
    expect(sockets).toHaveLength(1);
  });

  it('gives up retrying a transient failure after the retry cap without touching the socket', async () => {
    invalidateQueries.mockRejectedValue(new GeoChatRequestError('slow down', 'rate_limited', 429));
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    expect(invalidateQueries).toHaveBeenCalledTimes(1);

    // Backoff is 250, 500, 1000ms for the three retries; well past the last one nothing else fires.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invalidateQueries).toHaveBeenCalledTimes(4);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });
  });

  it('drops pending invalidation retries when the client stops', async () => {
    invalidateQueries.mockRejectedValue(new GeoChatRequestError('slow down', 'rate_limited', 429));
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    expect(invalidateQueries).toHaveBeenCalledTimes(1);

    client.stop();
    // A retry landing after stop would refetch queries `stop()` just removed for a signed-out account.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it('leaves knowledge-graph queries out of the broad reconcile', async () => {
    queryClient.setQueryData(['claim-picker', 'page', '', null], { entities: [] });
    queryClient.setQueryData(['debates', 'claims', 'space-1', 'all'], { claims: [] });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    type InvalidationFilters = NonNullable<Parameters<QueryClient['invalidateQueries']>[0]>;
    const invalidationCalls = invalidateQueries.mock.calls as unknown as Array<[InvalidationFilters]>;
    const predicate = invalidationCalls.map(call => call[0]).find(filters => 'predicate' in filters)?.predicate;
    expect(predicate).toBeTypeOf('function');
    const cache = queryClient.getQueryCache();
    // The picker page comes from the knowledge graph; a socket event says nothing about it, and a
    // failing graph refetch under the reconcile would be read as a broken socket.
    expect(predicate!(cache.find({ queryKey: ['claim-picker', 'page', '', null] })!)).toBe(false);
    expect(predicate!(cache.find({ queryKey: ['debates', 'claims', 'space-1', 'all'] })!)).toBe(true);
  });

  it('ignores a refetch cancelled by a later flush instead of recycling the socket', async () => {
    invalidateQueries.mockRejectedValueOnce(new CancelledError());
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    // The later flush owns the refresh; this is not a gateway problem.
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });
    const callsAfterFlush = invalidateQueries.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(invalidateQueries.mock.calls.length).toBe(callsAfterFlush);
    expect(sockets).toHaveLength(1);
  });

  it('resets the cached session before reconnecting when a refetch is rejected as unauthorized', async () => {
    // `restoreAllMocks` does not clear a factory-created `vi.fn`, so start from a known count.
    vi.mocked(resetGeoChatSession).mockClear();
    invalidateQueries.mockRejectedValueOnce(new GeoChatRequestError('token expired', 'unauthorized', 401));
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    // Reconnecting alone would re-present the rejected credentials: `getGeoChatSession` returns the
    // stored session until it is nearly expired.
    expect(resetGeoChatSession).toHaveBeenCalled();
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
  });

  it('reconnects with a fresh session when the server says the token expired early', async () => {
    vi.mocked(resetGeoChatSession).mockClear();
    client.retainScope({ scope: 'space', space_id: 'space-1' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    // Revoked while `expires_at` is still ten minutes out, and still the stored session.
    vi.mocked(getStoredGeoChatAccessToken).mockReturnValueOnce('access token');
    session = { ...session, access_token: 'fresh-token' };
    sockets[0]!.receive('ERROR', { code: 'authentication_expired', message: 'token expired' });

    expect(resetGeoChatSession).toHaveBeenCalledTimes(1);
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    expect(client.getSnapshot()).toMatchObject({ paused: true, pauseReason: 'session' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(sockets[1]!.url).toContain('access_token=fresh-token');
    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });

    // A repeat inside the cooldown neither parks nor spins: it reconnects again, on a longer floor.
    vi.mocked(getStoredGeoChatAccessToken).mockReturnValueOnce('fresh-token');
    sockets[1]!.receive('ERROR', { code: 'authentication_expired', message: 'token expired' });
    expect(resetGeoChatSession).toHaveBeenCalledTimes(2);
    expect(sockets[1]!.readyState).toBe(FakeWebSocket.CLOSED);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
    sockets[2]!.open();
    sockets[2]!.receive('READY', readyPayload([]));
    expect(sockets[2]!.sent).toContainEqual(
      expect.objectContaining({ op: 'SUBSCRIBE', payload: { scope: 'space', space_id: 'space-1' } })
    );
  });

  it("keeps a newer stored session when the socket's token is rejected", async () => {
    vi.mocked(resetGeoChatSession).mockClear();
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));

    // Another tab already refreshed: the stored session is newer than this socket's.
    vi.mocked(getStoredGeoChatAccessToken).mockReturnValueOnce('other-tab-token');
    session = { ...session, access_token: 'other-tab-token' };
    sockets[0]!.receive('ERROR', { code: 'authentication_expired', message: 'token expired' });

    expect(resetGeoChatSession).not.toHaveBeenCalled();
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets[1]!.url).toContain('access_token=other-tab-token');
  });

  it('cancels an in-flight snapshot before invalidating it', async () => {
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries').mockResolvedValue();
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    expect(cancelQueries).toHaveBeenCalledWith({ predicate: expect.any(Function), refetchType: 'active' });
    expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(invalidateQueries.mock.invocationCallOrder[0]!);
  });

  it('leaves a first-load query running while cancelling one that already holds data', async () => {
    queryClient.setQueryData(['debates', 'claims', 'space-1', ['claim-2']], { claims: [] });
    const firstLoad = new QueryObserver(queryClient, {
      queryKey: ['debates', 'claims', 'space-1', ['claim-3']],
      queryFn: () => new Promise(() => undefined),
      retry: false,
    });
    const unsubscribe = firstLoad.subscribe(() => undefined);
    await vi.runAllTicks();
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries');

    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    sockets[0]!.receive('EVENT', {
      event_id: 'event-claims',
      event_type: 'debate.claims_changed',
      payload: { space_id: 'space-1', claim_entity_ids: ['claim-2', 'claim-3'] },
    });
    await flushInvalidations();

    // Cancelling protects fresh data from a stale write. The first-load query has no data to
    // protect, and aborting it only restarts a request that was about to land.
    const cancelFilters = cancelQueries.mock.calls.map(([filters]) => filters).find(filters => filters?.predicate);
    expect(cancelFilters?.predicate).toBeTypeOf('function');
    const cache = queryClient.getQueryCache();
    expect(cancelFilters!.predicate!(cache.find({ queryKey: ['debates', 'claims', 'space-1', ['claim-2']] })!)).toBe(
      true
    );
    expect(cancelFilters!.predicate!(cache.find({ queryKey: ['debates', 'claims', 'space-1', ['claim-3']] })!)).toBe(
      false
    );
    expect(cache.find({ queryKey: ['debates', 'claims', 'space-1', ['claim-3']] })!.state.fetchStatus).toBe('fetching');
    unsubscribe();
  });

  // The rematch picker holds a positions batch per page of claims on screen, and the other side's
  // responses arrive faster than those round trips complete. Restarting every batch on every
  // event meant none of them landed while the responses kept coming. A batch in flight is left to
  // land, then asked again so the screen never shows an answer older than the event.
  it('lets an in-flight rematch batch land instead of cancelling it, then asks it again', async () => {
    const batchKey = ['debates', 'account', 'user-a', 'rematch', 'rematch-1', 'claims', ['claim-2']];
    queryClient.setQueryData(batchKey, { claims: [], excluded_claim_ids: [] });
    let settle!: () => void;
    const inFlight = new QueryObserver(queryClient, {
      queryKey: batchKey,
      queryFn: () =>
        new Promise<unknown>(resolve => {
          settle = () => resolve({ claims: [{ claim: { claim_entity_id: 'claim-2' } }], excluded_claim_ids: [] });
        }),
      retry: false,
    });
    const unsubscribe = inFlight.subscribe(() => undefined);
    void inFlight.refetch();
    await vi.runAllTicks();
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries');
    const refetchQueries = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue();

    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    refetchQueries.mockClear();
    sockets[0]!.receive('EVENT', {
      event_id: 'event-claims',
      event_type: 'debate.claims_changed',
      payload: { space_id: 'space-1', claim_entity_ids: ['claim-2'] },
    });
    await flushInvalidations();

    const cache = queryClient.getQueryCache();
    const batch = cache.find({ queryKey: batchKey })!;
    // Not cancelled, even though it holds data.
    const cancelFilters = cancelQueries.mock.calls.map(([filters]) => filters).find(filters => filters?.predicate);
    expect(cancelFilters!.predicate!(batch)).toBe(false);
    expect(batch.state.fetchStatus).toBe('fetching');
    // The invalidation joins the request in flight rather than restarting it...
    expect(invalidateQueries).toHaveBeenCalledWith(
      { predicate: expect.any(Function), refetchType: 'active' },
      { throwOnError: true, cancelRefetch: false }
    );
    // ...and once that has landed the batch is asked again, so the answer postdates the event.
    const reask = refetchQueries.mock.calls.find(([filters]) => filters?.predicate?.(batch));
    expect(reask).toBeDefined();
    expect(reask![1]).toEqual({ throwOnError: true, cancelRefetch: false });

    settle();
    unsubscribe();
  });

  // A hook-side refresh can cancel one joined batch mid-flush. That batch's cancellation must not
  // cost the others in the same flush the re-ask that brings them past the event.
  it('still asks an in-flight rematch batch again when the joined invalidation was cancelled', async () => {
    const batchKey = ['debates', 'account', 'user-a', 'rematch', 'rematch-1', 'claims', ['claim-2']];
    queryClient.setQueryData(batchKey, { claims: [], excluded_claim_ids: [] });
    let settle!: () => void;
    const inFlight = new QueryObserver(queryClient, {
      queryKey: batchKey,
      queryFn: () =>
        new Promise<unknown>(resolve => {
          settle = () => resolve({ claims: [], excluded_claim_ids: [] });
        }),
      retry: false,
    });
    const unsubscribe = inFlight.subscribe(() => undefined);
    void inFlight.refetch();
    await vi.runAllTicks();
    const refetchQueries = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue();

    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    refetchQueries.mockClear();
    invalidateQueries.mockRejectedValueOnce(new CancelledError());
    sockets[0]!.receive('EVENT', {
      event_id: 'event-claims',
      event_type: 'debate.claims_changed',
      payload: { space_id: 'space-1', claim_entity_ids: ['claim-2'] },
    });
    await flushInvalidations();

    const batch = queryClient.getQueryCache().find({ queryKey: batchKey })!;
    expect(refetchQueries.mock.calls.some(([filters]) => filters?.predicate?.(batch))).toBe(true);
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);

    settle();
    unsubscribe();
  });

  it('rotates the socket thirty seconds before token expiry', async () => {
    session = { ...session, expires_at: '2026-07-20T12:01:00.000Z' };
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));

    await vi.advanceTimersByTimeAsync(29_999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(sockets).toHaveLength(2);
  });

  it('reconciles a scope again when READY confirms an unsubscribe/resubscribe race', async () => {
    const release = client.retainScope({ scope: 'space', space_id: 'space-1' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([{ scope: 'space', space_id: 'space-1' }]));
    await flushInvalidations();
    invalidateQueries.mockClear();

    release();
    const releaseAgain = client.retainScope({ scope: 'space', space_id: 'space-1' });
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    sockets[0]!.receive('READY', readyPayload([{ scope: 'space', space_id: 'space-1' }]));
    await flushInvalidations();

    expectInvalidated(invalidateQueries, { queryKey: ['debates', 'claims', 'space-1'], refetchType: 'active' });
    expectInvalidated(invalidateQueries, { queryKey: ['debates', 'space', 'space-1'], refetchType: 'active' });
    releaseAgain();
  });

  it('reconnects and replays desired subscriptions after a rate-limited command', async () => {
    client.retainScope({ scope: 'space', space_id: 'space-1' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    sockets[0]!.receive('ERROR', { code: 'rate_limited', message: 'retry after 5 seconds' });
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    expect(client.getSnapshot()).toMatchObject({ status: 'degraded', paused: true });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    expect(sockets[1]!.sent).toContainEqual(
      expect.objectContaining({ op: 'SUBSCRIBE', payload: { scope: 'space', space_id: 'space-1' } })
    );
  });

  it('honors server retry hints longer than the normal reconnect cap', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    sockets[0]!.receive('ERROR', { code: 'rate_limited', message: 'retry after 45 seconds' });
    await vi.advanceTimersByTimeAsync(44_999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
  });

  it('shows degraded mode without reconnecting when the subscription cap is reached', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));

    sockets[0]!.receive('ERROR', { code: 'subscription_limit_reached', message: 'too many subscriptions' });

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
    expect(client.getSnapshot()).toMatchObject({ status: 'degraded', paused: true });
  });

  // GEO-2650. This used to park in degraded forever. Nothing in that branch closed the socket, so
  // heartbeats kept being acked, the two-missed-ack path to `forceReconnect` was never reached, and
  // there was no route back to `ready` for the rest of the session — one scope-level rejection took
  // the account-level stream, and with it the incoming-request popup, down with it.
  // GEO-2670. Every pause used to be the same `{ degraded, paused }`, so spending the command
  // budget looked exactly like a dropped socket — and tracing it meant reading the subscription
  // code rather than a log line. The reason is what makes a pause actionable.
  it('says why live updates are paused', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    expect(client.getSnapshot()).toMatchObject({ paused: false, pauseReason: null });

    // Our fault, not the network's: we sent more commands than the session allows.
    sockets[0]!.receive('ERROR', { code: 'rate_limited', message: 'retry after 5 seconds' });
    expect(client.getSnapshot()).toMatchObject({ paused: true, pauseReason: 'rate_limited' });

    await vi.advanceTimersByTimeAsync(5_000);
    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    expect(client.getSnapshot()).toMatchObject({ paused: false, pauseReason: null });

    // A ceiling we are sitting against, which a reconnect would hit again.
    sockets[1]!.receive('ERROR', {
      code: 'subscription_limit_reached',
      message: 'too many subscriptions',
    });
    expect(client.getSnapshot()).toMatchObject({ paused: true, pauseReason: 'subscription_limit' });
  });

  // A dropped socket is ordinary transport trouble, and has to stay distinguishable from the two
  // above — that distinction is the whole point.
  it('reports a dropped socket as disconnected rather than as a client fault', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));

    sockets[0]!.serverClose();

    expect(client.getSnapshot()).toMatchObject({ paused: true, pauseReason: 'disconnected' });
  });

  // A server that never advertises the debate capability is not going to start: nothing recovers
  // this without a deploy, so it must not read as a transient pause.
  it('reports a missing debate capability as unsupported', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', { capabilities: [], subscriptions: [] });

    expect(client.getSnapshot()).toMatchObject({ paused: true, pauseReason: 'unsupported' });
  });

  // The trap in `setSnapshot`: it skips notifying when status and paused are unchanged. These two
  // pauses are both `degraded/paused` with no ready in between, so the reason is the *only*
  // difference — which is exactly the case that would be written and never delivered.
  //
  // An earlier version of this test put a reconnect between them. That reset `paused` to false, so
  // the status comparison already differed and the guard was never exercised: the test passed with
  // the guard deleted.
  it('notifies listeners when only the pause reason changes', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));

    // Parks without reconnecting, so the socket stays open and `paused` stays true throughout.
    sockets[0]!.receive('ERROR', {
      code: 'subscription_limit_reached',
      message: 'too many subscriptions',
    });
    expect(client.getSnapshot()).toMatchObject({ paused: true, pauseReason: 'subscription_limit' });

    const seen: (string | null)[] = [];
    const unsubscribe = client.subscribe(() => seen.push(client.getSnapshot().pauseReason));

    // Same status, same `paused`, different reason.
    sockets[0]!.receive('ERROR', { code: 'subscription_forbidden', message: 'not authorized' });

    unsubscribe();
    expect(seen).toEqual(['disconnected']);
  });

  it('recycles the socket when a subscription is rejected, rather than parking on it', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));

    sockets[0]!.receive('ERROR', { code: 'subscription_forbidden', message: 'not authorized' });

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    expect(client.getSnapshot()).toMatchObject({ status: 'degraded', paused: true });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });
  });

  // The other half of that trade: `reconnectAttempt` resets on a successful invalidation flush, which
  // a fresh connection performs before the error recurs, so the backoff never grows and a
  // reproducing rejection would spin roughly once a second indefinitely.
  it('stops recycling when the same rejection reproduces inside the cooldown', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    sockets[0]!.receive('ERROR', { code: 'subscription_forbidden', message: 'not authorized' });

    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    sockets[1]!.receive('ERROR', { code: 'subscription_forbidden', message: 'not authorized' });

    expect(sockets[1]!.readyState).toBe(FakeWebSocket.OPEN);
    expect(client.getSnapshot()).toMatchObject({ status: 'degraded', paused: true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sockets).toHaveLength(2);
  });

  // And once the socket has been healthy for the cooldown, a later rejection is a fresh incident
  // rather than the same one reproducing, so it gets its own recovery attempt.
  it('recycles again once the cooldown has passed', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    sockets[0]!.receive('ERROR', { code: 'subscription_forbidden', message: 'not authorized' });

    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    await vi.advanceTimersByTimeAsync(60_000);
    sockets[1]!.receive('ERROR', { code: 'subscription_forbidden', message: 'not authorized' });

    expect(sockets[1]!.readyState).toBe(FakeWebSocket.CLOSED);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(3);
  });

  it('drops only a refused scope that the ERROR names, keeping the socket and other scopes', async () => {
    client.retainScope({ scope: 'space', space_id: 'space-1' });
    client.retainScope({ scope: 'debate', debate_id: 'private-debate' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();

    const refusal = {
      code: 'subscription_forbidden',
      message: 'not authorized',
      subscription: { scope: 'debate', debate_id: 'private-debate' },
    };
    sockets[0]!.receive('ERROR', refusal);

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });
    // A later READY on the same socket does not re-send it.
    sockets[0]!.receive('READY', readyPayload([{ scope: 'space', space_id: 'space-1' }]));
    expect(sockets[0]!.sent.filter(message => message.op === 'SUBSCRIBE')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sockets).toHaveLength(1);

    // A reconnect retries it once, and a second refusal still does not recycle.
    sockets[0]!.serverClose();
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    const subscribed = () =>
      sockets[1]!.sent.filter(message => message.op === 'SUBSCRIBE').map(message => message.payload);
    expect(subscribed()).toEqual([
      { scope: 'space', space_id: 'space-1' },
      { scope: 'debate', debate_id: 'private-debate' },
    ]);

    sockets[1]!.receive('ERROR', refusal);
    sockets[1]!.receive('READY', readyPayload([{ scope: 'space', space_id: 'space-1' }]));
    expect(sockets[1]!.readyState).toBe(FakeWebSocket.OPEN);
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });
    expect(subscribed()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sockets).toHaveLength(2);
  });

  it('retries a refused scope once every holder has released it and it is retained again', async () => {
    const release = client.retainScope({ scope: 'debate', debate_id: 'private-debate' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    sockets[0]!.receive('ERROR', {
      code: 'subscription_forbidden',
      message: 'not authorized',
      subscription: { scope: 'debate', debate_id: 'private-debate' },
    });

    release();
    expect(sockets[0]!.sent.some(message => message.op === 'UNSUBSCRIBE')).toBe(false);

    client.retainScope({ scope: 'debate', debate_id: 'private-debate' });
    expect(sockets[0]!.sent.filter(message => message.op === 'SUBSCRIBE')).toHaveLength(2);
  });

  it('retries refused scopes after the account changes', async () => {
    client.retainScope({ scope: 'matchmaking' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    sockets[0]!.receive('ERROR', {
      code: 'subscription_forbidden',
      message: 'authentication is required for resource subscriptions',
      subscription: { scope: 'matchmaking' },
    });

    client.start(
      vi.fn(async () => 'privy-token'),
      'user-b'
    );
    await vi.runAllTicks();
    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    expect(sockets[1]!.sent).toContainEqual(
      expect.objectContaining({ op: 'SUBSCRIBE', payload: { scope: 'matchmaking' } })
    );
  });

  it('keeps recycling the socket when the refusal names no client scope', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));

    // A room subscription, which this client never sends and cannot map to a scope.
    sockets[0]!.receive('ERROR', {
      code: 'subscription_forbidden',
      message: 'not authorized',
      subscription: { space_id: 'space-1', room_id: 'room-1', room_kind: 'member', resume_after_seq: null },
    });

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    expect(client.getSnapshot()).toMatchObject({ status: 'degraded', paused: true });
  });

  it('re-sends a scope whose check failed on its own backoff, without parking the gateway', async () => {
    client.retainScope({ scope: 'space', space_id: 'space-1' });
    const releaseDebate = client.retainScope({ scope: 'debate', debate_id: 'debate-1' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([{ scope: 'space', space_id: 'space-1' }]));
    await flushInvalidations();

    const failure = {
      code: 'subscription_check_failed',
      message: 'try again',
      subscription: { scope: 'debate', debate_id: 'debate-1' },
    };
    const debateSubscribes = () =>
      sockets[0]!.sent.filter(
        message => message.op === 'SUBSCRIBE' && (message.payload as { scope: string }).scope === 'debate'
      ).length;
    expect(debateSubscribes()).toBe(1);

    // A long outage: every re-send fails, and the gaps grow 1s, 2s, 4s, 8s.
    for (const [index, delay] of [1_000, 2_000, 4_000, 8_000].entries()) {
      sockets[0]!.receive('ERROR', failure);
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(debateSubscribes()).toBe(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(debateSubscribes()).toBe(index + 2);
    }

    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });

    // The other scope keeps delivering.
    invalidateQueries.mockClear();
    sockets[0]!.receive('EVENT', {
      event_id: 'event-space-1',
      event_type: 'debate.state_changed',
      payload: { space_id: 'space-1' },
    });
    await flushInvalidations();
    expectInvalidated(invalidateQueries, { queryKey: ['debates', 'space', 'space-1'], refetchType: 'active' });

    // Releasing cancels the pending retry.
    sockets[0]!.receive('ERROR', failure);
    releaseDebate();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(debateSubscribes()).toBe(5);
  });

  it('does not let a READY for another scope re-send a scope waiting on its check backoff', async () => {
    client.retainScope({ scope: 'space', space_id: 'space-1' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([{ scope: 'space', space_id: 'space-1' }]));
    client.retainScope({ scope: 'debate', debate_id: 'debate-b' });
    sockets[0]!.receive('ERROR', {
      code: 'subscription_check_failed',
      message: 'try again',
      subscription: { scope: 'debate', debate_id: 'debate-b' },
    });
    const debateSubscribes = () =>
      sockets[0]!.sent.filter(
        message => message.op === 'SUBSCRIBE' && (message.payload as { scope: string }).scope === 'debate'
      ).length;

    // Another scope's subscribe succeeds, and geo-chat answers with READY.
    client.retainScope({ scope: 'space', space_id: 'space-2' });
    sockets[0]!.receive(
      'READY',
      readyPayload([
        { scope: 'space', space_id: 'space-1' },
        { scope: 'space', space_id: 'space-2' },
      ])
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(debateSubscribes()).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(debateSubscribes()).toBe(2);
  });

  it('resets the backoff once READY confirms the scope', async () => {
    client.retainScope({ scope: 'debate', debate_id: 'debate-1' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    const failure = {
      code: 'subscription_check_failed',
      message: 'try again',
      subscription: { scope: 'debate', debate_id: 'debate-1' },
    };
    const subscribes = () => sockets[0]!.sent.filter(message => message.op === 'SUBSCRIBE').length;

    sockets[0]!.receive('ERROR', failure);
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[0]!.receive('ERROR', failure);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(subscribes()).toBe(3);

    sockets[0]!.receive('READY', readyPayload([{ scope: 'debate', debate_id: 'debate-1' }]));
    sockets[0]!.receive('ERROR', failure);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(subscribes()).toBe(4);
  });

  it('keeps a backing-off scope out of the reconnect burst until its retry is due', async () => {
    client.retainScope({ scope: 'space', space_id: 'space-1' });
    client.retainScope({ scope: 'debate', debate_id: 'debate-1' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    const failure = {
      code: 'subscription_check_failed',
      message: 'try again',
      subscription: { scope: 'debate', debate_id: 'debate-1' },
    };
    // Two failures: the next retry is due 2s after the second.
    sockets[0]!.receive('ERROR', failure);
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[0]!.receive('ERROR', failure);

    sockets[0]!.serverClose();
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    const subscribed = () =>
      sockets[1]!.sent.filter(message => message.op === 'SUBSCRIBE').map(message => message.payload);
    expect(subscribed()).toEqual([{ scope: 'space', space_id: 'space-1' }]);

    await vi.advanceTimersByTimeAsync(999);
    expect(subscribed()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(subscribed()).toEqual([
      { scope: 'space', space_id: 'space-1' },
      { scope: 'debate', debate_id: 'debate-1' },
    ]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(subscribed()).toHaveLength(2);
  });

  it('sends a check retry that came due while disconnected on the next READY, once', async () => {
    client.retainScope({ scope: 'debate', debate_id: 'debate-1' });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    sockets[0]!.receive('ERROR', {
      code: 'subscription_check_failed',
      message: 'try again',
      subscription: { scope: 'debate', debate_id: 'debate-1' },
    });

    sockets[0]!.serverClose();
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1]!.open();
    sockets[1]!.receive('READY', readyPayload([]));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sockets[1]!.sent.filter(message => message.op === 'SUBSCRIBE')).toHaveLength(1);
  });

  it('keeps recycling the socket when a failed check names no scope', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));

    sockets[0]!.receive('ERROR', { code: 'subscription_check_failed', message: 'try again' });

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    expect(client.getSnapshot()).toMatchObject({ status: 'degraded', paused: true });
  });

  it('matches ERROR echoes to a retained debate scope whatever the id spelling', async () => {
    const dashedUpper = '3F2B8C1A-9D4E-4A7B-B6C5-1E0F2A3B4C5D';
    const dashless = '3f2b8c1a9d4e4a7bb6c51e0f2a3b4c5d';
    const refusedDashed = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    client.retainScope({ scope: 'debate', debate_id: dashedUpper });
    client.retainScope({ scope: 'debate', debate_id: refusedDashed });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    const subscribes = (debateId: string) =>
      sockets[0]!.sent.filter(
        message => message.op === 'SUBSCRIBE' && (message.payload as { debate_id?: string }).debate_id === debateId
      ).length;

    sockets[0]!.receive('ERROR', {
      code: 'subscription_check_failed',
      message: 'try again',
      subscription: { scope: 'debate', debate_id: dashless },
    });
    sockets[0]!.receive('ERROR', {
      code: 'subscription_forbidden',
      message: 'not authorized',
      subscription: { scope: 'debate', debate_id: '7c9e6679742540de944be07fc1f90ae7' },
    });

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
    // The retry goes out in the retained spelling; the refused scope stays refused through READY.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(subscribes(dashedUpper)).toBe(2);
    sockets[0]!.receive('READY', readyPayload([]));
    expect(subscribes(refusedDashed)).toBe(1);
    expect(sockets).toHaveLength(1);
  });

  it('confirms a retained space scope from a normalized READY and reconciles its own query keys', async () => {
    const dashed = 'A1B2C3D4-E5F6-4789-8ABC-DEF012345678';
    client.retainScope({ scope: 'space', space_id: dashed });
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));
    await flushInvalidations();
    invalidateQueries.mockClear();

    sockets[0]!.receive('READY', readyPayload([{ scope: 'space', space_id: 'a1b2c3d4e5f647898abcdef012345678' }]));
    await flushInvalidations();
    expectInvalidated(invalidateQueries, { queryKey: ['debates', 'claims', dashed], refetchType: 'active' });

    // A check failure echoed in the zero-padded 32-byte form still finds it.
    sockets[0]!.receive('ERROR', {
      code: 'subscription_check_failed',
      message: 'try again',
      subscription: { scope: 'space', space_id: '0xa1b2c3d4e5f647898abcdef01234567800000000000000000000000000000000' },
    });
    expect(sockets[0]!.readyState).toBe(FakeWebSocket.OPEN);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(
      sockets[0]!.sent.filter(
        message => message.op === 'SUBSCRIBE' && (message.payload as { space_id?: string }).space_id === dashed
      )
    ).toHaveLength(2);
  });

  it('reconnects with a new session when the authenticated account changes', async () => {
    queryClient.setQueryData(['debates', 'account', 'user-a', 'activity'], { private: 'user-a' });
    client.start(
      vi.fn(async () => 'user-a-privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    expect(getSession.mock.calls[0]?.[1]).toBe('user-a');

    session = { ...session, access_token: 'user-b-access-token' };
    client.start(
      vi.fn(async () => 'user-b-privy-token'),
      'user-b'
    );
    await vi.runAllTicks();

    expect(sockets[0]!.readyState).toBe(FakeWebSocket.CLOSED);
    expect(queryClient.getQueryData(['debates', 'account', 'user-a', 'activity'])).toBeUndefined();
    expect(getSession.mock.calls[1]?.[1]).toBe('user-b');
    expect(sockets[1]!.url).toContain('access_token=user-b-access-token');
  });

  it('never opens a socket while stopped, which keeps signed-out views snapshot-only', async () => {
    client.stop();
    client.retainScope({ scope: 'debate', debate_id: 'public-debate' });
    await vi.runAllTicks();

    expect(sockets).toHaveLength(0);
    expect(client.getSnapshot()).toMatchObject({ status: 'idle', paused: false });
  });

  it('enters degraded mode when the server lacks the required capability and recovers on READY', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', { ...readyPayload([]), capabilities: [] });

    expect(client.getSnapshot()).toMatchObject({ status: 'degraded', paused: true });

    sockets[0]!.receive('READY', readyPayload([]));
    expect(client.getSnapshot()).toMatchObject({ status: 'ready', paused: false });
  });

  it('ignores malformed protocol envelopes', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();

    expect(() => {
      sockets[0]!.receiveRaw('null');
      sockets[0]!.receiveRaw('42');
      sockets[0]!.receiveRaw(JSON.stringify({ v: 1, op: 5, payload: {} }));
    }).not.toThrow();
    expect(client.getSnapshot()).toMatchObject({ status: 'connecting', paused: false });
  });
});

function readyPayload(subscriptions: unknown[]) {
  return {
    session_id: 'session-1',
    heartbeat_interval_ms: 30_000,
    capabilities: ['debate_invalidations_v1'],
    subscriptions,
  };
}

async function flushInvalidations() {
  await vi.advanceTimersByTimeAsync(50);
}

function expectInvalidated(invalidateQueries: ReturnType<typeof vi.spyOn>, filters: unknown) {
  expect(invalidateQueries.mock.calls).toContainEqual([filters, { throwOnError: true, cancelRefetch: false }]);
}

function expectBroadInvalidated(invalidateQueries: ReturnType<typeof vi.spyOn>) {
  expect(invalidateQueries).toHaveBeenCalledWith(
    { predicate: expect.any(Function), refetchType: 'active' },
    { throwOnError: true, cancelRefetch: false }
  );
}
