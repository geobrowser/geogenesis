import { CancelledError, QueryClient, QueryObserver } from '@tanstack/react-query';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError, resetGeoChatSession } from './api';
import { DebateGatewayClient, type DebateGatewaySession } from './debate-gateway';

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, resetGeoChatSession: vi.fn() };
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

    for (const kind of ['people', 'matchmaking-claims', 'matches']) {
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
    queryClient.setQueryData(['claim-response-summaries', 'profile-1', 'space-1', ['claim-2:veracity']], new Map());
    queryClient.setQueryData(['claim-response-summary-data', 'profile-1', 'space-1', ['claim-2:veracity']], new Map());
    queryClient.setQueryData(['claim-response-summaries', 'profile-1', 'space-2', ['claim-2:veracity']], new Map());
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
          .find({ queryKey: ['claim-response-summaries', 'profile-1', 'space-1', ['claim-2:veracity']] })!
      )
    ).toBe(true);
    expect(
      predicate!(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['claim-response-summary-data', 'profile-1', 'space-1', ['claim-2:veracity']] })!
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
          .find({ queryKey: ['claim-response-summaries', 'profile-1', 'space-2', ['claim-2:veracity']] })!
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

    const responseTargets = ['claim-1:stance', 'claim-2:veracity'];
    const summaryDataKey = ['claim-response-summary-data', 'profile-1', 'space-1', responseTargets] as const;
    const responseBatchKey = ['claim-response-summaries', 'profile-1', 'space-1', responseTargets] as const;
    const fetchSummaryData = vi.fn(async () => new Map([['claim-2:veracity', { negative: 1 }]]));
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

  it('pauses live updates when a subscription is rejected', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', readyPayload([]));

    sockets[0]!.receive('ERROR', { code: 'subscription_forbidden', message: 'not authorized' });

    expect(client.getSnapshot()).toMatchObject({ status: 'degraded', paused: true });
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
