import { QueryClient } from '@tanstack/react-query';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateGatewayClient, type DebateGatewaySession } from './debate-gateway';

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
    expectInvalidated(invalidateQueries, { queryKey: ['debates'], refetchType: 'active' });
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
        [{ queryKey: ['debates', 'media', 'debate-1'], refetchType: 'active' }, { throwOnError: true }],
        [{ queryKey: ['debates', 'detail', 'debate-1'], refetchType: 'active' }, { throwOnError: true }],
        [{ queryKey: ['debates', 'transcript', 'debate-1'], refetchType: 'active' }, { throwOnError: true }],
        [{ queryKey: ['debates', 'space', 'space-1'], refetchType: 'active' }, { throwOnError: true }],
      ])
    );
    expect(invalidateQueries).toHaveBeenCalledTimes(4);
  });

  it.each([
    [
      'activity',
      { event_type: 'debate.activity_changed', payload: {} },
      [['debates', 'account', 'user-a', 'activity']],
    ],
    [
      'state',
      { event_type: 'debate.state_changed', payload: { debate_id: 'debate-1', space_id: 'space-1' } },
      [
        ['debates', 'detail', 'debate-1'],
        ['debates', 'space', 'space-1'],
        ['debates', 'account', 'user-a', 'activity'],
      ],
    ],
    [
      'rematch',
      { event_type: 'debate.rematch_changed', payload: { rematch_session_id: 'rematch-1' } },
      [
        ['debates', 'account', 'user-a', 'rematch', 'rematch-1'],
        ['debates', 'account', 'user-a', 'activity'],
      ],
    ],
    [
      'share prompts',
      { event_type: 'debate.share_prompts_changed', payload: {} },
      [['debates', 'account', 'user-a', 'share-prompts']],
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

  it('filters claim invalidations to active claim queries that intersect the event', async () => {
    queryClient.setQueryData(['debates', 'claims', 'space-1', ['claim-1']], {});
    queryClient.setQueryData(['debates', 'claims', 'space-1', ['claim-2']], {});
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
    expect(refetchQueries).not.toHaveBeenCalled();
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
    expectInvalidated(invalidateQueries, { queryKey: ['debates'], refetchType: 'active' });

    invalidateQueries.mockClear();
    sockets[1]!.receive('ERROR', { code: 'events_lagged', message: 'events skipped' });
    await flushInvalidations();
    expectInvalidated(invalidateQueries, { queryKey: ['debates'], refetchType: 'active' });
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
    expect(client.getSnapshot()).toEqual({ status: 'degraded', paused: true });
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
    expect(client.getSnapshot()).toEqual({ status: 'degraded', paused: true });
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

    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ['debates'], refetchType: 'active' });
    expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(invalidateQueries.mock.invocationCallOrder[0]!);
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
    expect(client.getSnapshot()).toEqual({ status: 'degraded', paused: true });

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
    expect(client.getSnapshot()).toEqual({ status: 'degraded', paused: true });
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

    expect(client.getSnapshot()).toEqual({ status: 'degraded', paused: true });
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
    expect(client.getSnapshot()).toEqual({ status: 'idle', paused: false });
  });

  it('enters degraded mode when the server lacks the required capability and recovers on READY', async () => {
    client.start(
      vi.fn(async () => 'privy-token'),
      'user-a'
    );
    await vi.runAllTicks();
    sockets[0]!.open();
    sockets[0]!.receive('READY', { ...readyPayload([]), capabilities: [] });

    expect(client.getSnapshot()).toEqual({ status: 'degraded', paused: true });

    sockets[0]!.receive('READY', readyPayload([]));
    expect(client.getSnapshot()).toEqual({ status: 'ready', paused: false });
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
    expect(client.getSnapshot()).toEqual({ status: 'connecting', paused: false });
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
  expect(invalidateQueries.mock.calls).toContainEqual([filters, { throwOnError: true }]);
}
