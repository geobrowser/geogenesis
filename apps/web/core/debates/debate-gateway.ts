'use client';

import type { QueryClient, QueryKey } from '@tanstack/react-query';

import * as React from 'react';

import { queryClient } from '~/core/query-client';

import { type GeoChatSession, type GetPrivyIdentityToken, getGeoChatApiBaseUrl, getGeoChatSession } from './api';

export type DebateGatewaySession = GeoChatSession;

export type DebateGatewayScope = { scope: 'space'; space_id: string } | { scope: 'debate'; debate_id: string };

export type DebateGatewaySnapshot = {
  status: 'idle' | 'connecting' | 'ready' | 'degraded';
  paused: boolean;
};

type DebateEventPayload = {
  space_id?: string;
  debate_id?: string;
  rematch_session_id?: string;
  claim_entity_ids?: string[];
};

type DebateInvalidationEvent = {
  event_id: string;
  event_type: string;
  payload: DebateEventPayload;
};

type GatewayEnvelope = {
  v: number;
  op: string;
  seq?: number | null;
  payload: unknown;
};

type ReadyPayload = {
  capabilities?: string[];
  subscriptions?: unknown[];
};

type WebSocketLike = {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(value: string): void;
  close(): void;
};

type DebateGatewayClientOptions = {
  queryClient: QueryClient;
  getSession: (getPrivyIdentityToken: GetPrivyIdentityToken, accountKey: string) => Promise<DebateGatewaySession>;
  getApiBaseUrl: () => string;
  createWebSocket?: (url: string) => WebSocketLike;
  random?: () => number;
};

type InvalidationFilters = NonNullable<Parameters<QueryClient['invalidateQueries']>[0]>;

const OPEN = 1;
const CAPABILITY = 'debate_invalidations_v1';
const MAX_RECENT_EVENT_IDS = 256;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const HANDSHAKE_TIMEOUT_MS = 10_000;
const INVALIDATION_COALESCE_MS = 50;
const BROAD_INVALIDATION_KEY = 'debates:all';

export class DebateGatewayClient {
  private readonly queryClient: QueryClient;
  private readonly getSession: DebateGatewayClientOptions['getSession'];
  private readonly getApiBaseUrl: DebateGatewayClientOptions['getApiBaseUrl'];
  private readonly createWebSocket: NonNullable<DebateGatewayClientOptions['createWebSocket']>;
  private readonly random: () => number;
  private readonly listeners = new Set<() => void>();
  private readonly scopes = new Map<string, { scope: DebateGatewayScope; count: number }>();
  private readonly sentScopes = new Set<string>();
  private readonly confirmedScopes = new Set<string>();
  private readonly recentEventIds = new Set<string>();
  private readonly recentEventIdOrder: string[] = [];
  private readonly pendingInvalidations = new Map<string, InvalidationFilters>();

  private snapshot: DebateGatewaySnapshot = { status: 'idle', paused: false };
  private getPrivyIdentityToken: GetPrivyIdentityToken | null = null;
  private accountKey: string | null = null;
  private socket: WebSocketLike | null = null;
  private enabled = false;
  private hasReachedReady = false;
  private readyForDebates = false;
  private lastSequence: number | null = null;
  private reconnectAttempt = 0;
  private heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS;
  private heartbeatsAwaitingAck = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenRotationTimer: ReturnType<typeof setTimeout> | null = null;
  private invalidationTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionGeneration = 0;

  constructor(options: DebateGatewayClientOptions) {
    this.queryClient = options.queryClient;
    this.getSession = options.getSession;
    this.getApiBaseUrl = options.getApiBaseUrl;
    this.createWebSocket = options.createWebSocket ?? (url => new WebSocket(url) as unknown as WebSocketLike);
    this.random = options.random ?? Math.random;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(getPrivyIdentityToken: GetPrivyIdentityToken, accountKey: string) {
    if (this.enabled && this.accountKey !== accountKey) this.stop();
    this.getPrivyIdentityToken = getPrivyIdentityToken;
    this.accountKey = accountKey;
    if (this.enabled) return;
    this.enabled = true;
    this.setSnapshot({ status: 'connecting', paused: false });
    void this.connect();
  }

  stop() {
    const accountKey = this.accountKey;
    this.enabled = false;
    this.getPrivyIdentityToken = null;
    this.accountKey = null;
    this.hasReachedReady = false;
    this.lastSequence = null;
    this.reconnectAttempt = 0;
    this.clearAllTimers();
    this.disposeSocket();
    this.sentScopes.clear();
    this.confirmedScopes.clear();
    this.pendingInvalidations.clear();
    if (accountKey) this.queryClient.removeQueries({ queryKey: ['debates'] });
    this.setSnapshot({ status: 'idle', paused: false });
  }

  retainScope(scope: DebateGatewayScope) {
    const key = scopeKey(scope);
    const retained = this.scopes.get(key);
    if (retained) {
      retained.count += 1;
    } else {
      this.scopes.set(key, { scope, count: 1 });
      this.sendSubscription(scope, 'SUBSCRIBE');
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.scopes.get(key);
      if (!current) return;
      current.count -= 1;
      if (current.count > 0) return;
      this.scopes.delete(key);
      this.sentScopes.delete(key);
      this.confirmedScopes.delete(key);
      this.sendSubscription(scope, 'UNSUBSCRIBE');
    };
  }

  private async connect() {
    const getPrivyIdentityToken = this.getPrivyIdentityToken;
    const accountKey = this.accountKey;
    if (!this.enabled || !getPrivyIdentityToken || !accountKey || this.socket) return;
    const generation = ++this.connectionGeneration;

    try {
      const session = await this.getSession(getPrivyIdentityToken, accountKey);
      if (!this.enabled || generation !== this.connectionGeneration) return;

      const socket = this.createWebSocket(gatewayWebSocketUrl(this.getApiBaseUrl(), session.access_token));
      this.socket = socket;
      this.readyForDebates = false;
      this.sentScopes.clear();
      this.confirmedScopes.clear();
      this.scheduleTokenRotation(session);
      this.handshakeTimer = setTimeout(() => this.forceReconnect(socket), HANDSHAKE_TIMEOUT_MS);

      socket.onopen = () => undefined;
      socket.onmessage = event => this.handleMessage(socket, event.data);
      socket.onerror = () => this.forceReconnect(socket);
      socket.onclose = () => this.handleClose(socket);
    } catch {
      if (!this.enabled || generation !== this.connectionGeneration) return;
      this.setSnapshot({ status: 'degraded', paused: true });
      this.scheduleReconnect();
    }
  }

  private handleMessage(socket: WebSocketLike, value: unknown) {
    if (socket !== this.socket || typeof value !== 'string') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return;
    }
    if (!isGatewayEnvelope(parsed)) return;
    const envelope = parsed;
    if (typeof envelope.seq === 'number') this.lastSequence = Math.max(this.lastSequence ?? 0, envelope.seq);

    switch (envelope.op) {
      case 'HELLO':
        this.handleHello(envelope.payload);
        break;
      case 'READY':
        this.handleReady(envelope.payload);
        break;
      case 'EVENT':
        this.handleEvent(envelope.payload);
        break;
      case 'HEARTBEAT_ACK':
        this.heartbeatsAwaitingAck = 0;
        break;
      case 'RESUME':
        this.queueBroadReconcile();
        break;
      case 'ERROR':
        if (isEventsLagged(envelope.payload)) {
          this.queueBroadReconcile();
        } else if (isRateLimited(envelope.payload)) {
          this.forceReconnect(socket, rateLimitRetryDelayMs(envelope.payload));
        } else if (isSubscriptionLimitReached(envelope.payload)) {
          this.setSnapshot({ status: 'degraded', paused: true });
        } else {
          this.setSnapshot({ status: 'degraded', paused: true });
        }
        break;
    }
  }

  private handleHello(payload: unknown) {
    if (isRecord(payload) && typeof payload.heartbeat_interval_ms === 'number') {
      this.heartbeatIntervalMs = Math.max(1_000, payload.heartbeat_interval_ms);
    }
    this.heartbeatsAwaitingAck = 0;
    this.sendHeartbeat();
  }

  private handleReady(payload: unknown) {
    this.clearTimer('handshake');
    const ready = isRecord(payload) ? (payload as ReadyPayload) : {};
    const supportsDebates = Array.isArray(ready.capabilities) && ready.capabilities.includes(CAPABILITY);
    if (!supportsDebates) {
      this.readyForDebates = false;
      this.setSnapshot({ status: 'degraded', paused: true });
      return;
    }

    const firstReadyForSocket = !this.readyForDebates;
    this.readyForDebates = true;
    this.setSnapshot({ status: 'ready', paused: false });

    if (firstReadyForSocket) {
      this.queueBroadReconcile();
      if (this.hasReachedReady) {
        if (this.lastSequence !== null) this.sendEnvelope('RESUME', {}, this.lastSequence);
      }
      this.hasReachedReady = true;
    }

    const readyScopes = new Map<string, DebateGatewayScope>();
    for (const subscription of Array.isArray(ready.subscriptions) ? ready.subscriptions : []) {
      const scope = parseScope(subscription);
      if (!scope) continue;
      const key = scopeKey(scope);
      readyScopes.set(key, scope);
    }

    for (const key of this.confirmedScopes) {
      if (!readyScopes.has(key)) this.confirmedScopes.delete(key);
    }

    for (const [key, scope] of readyScopes) {
      if (!this.scopes.has(key) || this.confirmedScopes.has(key)) continue;
      this.confirmedScopes.add(key);
      this.queueScopeReconcile(scope);
    }

    for (const { scope } of this.scopes.values()) this.sendSubscription(scope, 'SUBSCRIBE');
  }

  private handleEvent(payload: unknown) {
    if (!isDebateEvent(payload) || this.recentEventIds.has(payload.event_id)) return;
    this.rememberEvent(payload.event_id);
    const identifiers = payload.payload;

    switch (payload.event_type) {
      case 'debate.activity_changed':
        this.queueAccountQuery('activity');
        break;
      case 'debate.claims_changed':
        if (identifiers.space_id) {
          this.queueClaims(identifiers.space_id, identifiers.claim_entity_ids);
        }
        break;
      case 'debate.state_changed':
        if (identifiers.debate_id) this.queueQuery(['debates', 'detail', identifiers.debate_id]);
        if (identifiers.space_id) this.queueQuery(['debates', 'space', identifiers.space_id]);
        this.queueAccountQuery('activity');
        break;
      case 'debate.rematch_changed':
        if (identifiers.rematch_session_id) {
          this.queueAccountQuery('rematch', identifiers.rematch_session_id);
        }
        this.queueAccountQuery('activity');
        break;
      case 'debate.media_changed':
        if (identifiers.debate_id) {
          this.queueQuery(['debates', 'media', identifiers.debate_id]);
          this.queueQuery(['debates', 'detail', identifiers.debate_id]);
          this.queueQuery(['debates', 'transcript', identifiers.debate_id]);
        }
        if (identifiers.space_id) this.queueQuery(['debates', 'space', identifiers.space_id]);
        break;
      case 'debate.share_prompts_changed':
        this.queueAccountQuery('share-prompts');
        break;
    }
  }

  private rememberEvent(eventId: string) {
    this.recentEventIds.add(eventId);
    this.recentEventIdOrder.push(eventId);
    if (this.recentEventIdOrder.length <= MAX_RECENT_EVENT_IDS) return;
    const expired = this.recentEventIdOrder.shift();
    if (expired) this.recentEventIds.delete(expired);
  }

  private queueScopeReconcile(scope: DebateGatewayScope) {
    if (scope.scope === 'space') {
      this.queueQuery(['debates', 'claims', scope.space_id]);
      this.queueQuery(['debates', 'space', scope.space_id]);
      return;
    }
    this.queueQuery(['debates', 'detail', scope.debate_id]);
    this.queueQuery(['debates', 'media', scope.debate_id]);
    this.queueQuery(['debates', 'transcript', scope.debate_id]);
  }

  private queueBroadReconcile() {
    this.queueInvalidation(BROAD_INVALIDATION_KEY, { queryKey: ['debates'], refetchType: 'active' });
  }

  private queueAccountQuery(kind: 'activity' | 'rematch' | 'share-prompts', id?: string) {
    if (!this.accountKey) return;
    this.queueQuery(
      id ? ['debates', 'account', this.accountKey, kind, id] : ['debates', 'account', this.accountKey, kind]
    );
  }

  private queueClaims(spaceId: string, claimEntityIds?: string[]) {
    if (!claimEntityIds?.length) {
      this.queueQuery(['debates', 'claims', spaceId]);
      return;
    }
    const changedClaims = new Set(claimEntityIds);
    this.queueInvalidation(`claims:${spaceId}:${claimEntityIds.slice().sort().join(',')}`, {
      predicate: query => {
        const [root, kind, querySpaceId, queryClaimIds] = query.queryKey;
        return (
          root === 'debates' &&
          kind === 'claims' &&
          querySpaceId === spaceId &&
          Array.isArray(queryClaimIds) &&
          queryClaimIds.some(claimId => typeof claimId === 'string' && changedClaims.has(claimId))
        );
      },
      refetchType: 'active',
    });
  }

  private queueQuery(queryKey: QueryKey) {
    this.queueInvalidation(`query:${JSON.stringify(queryKey)}`, { queryKey, refetchType: 'active' });
  }

  private queueInvalidation(key: string, filters: InvalidationFilters) {
    if (key === BROAD_INVALIDATION_KEY) {
      this.pendingInvalidations.clear();
    } else if (this.pendingInvalidations.has(BROAD_INVALIDATION_KEY)) {
      return;
    }
    this.pendingInvalidations.set(key, filters);
    if (this.invalidationTimer) return;
    this.invalidationTimer = setTimeout(() => {
      this.invalidationTimer = null;
      const invalidations = [...this.pendingInvalidations.values()];
      this.pendingInvalidations.clear();
      void this.flushInvalidations(invalidations);
    }, INVALIDATION_COALESCE_MS);
  }

  private async flushInvalidations(invalidations: InvalidationFilters[]) {
    const results = await Promise.allSettled(
      invalidations.map(async queryFilters => {
        await this.queryClient.cancelQueries(queryFilters);
        await this.queryClient.invalidateQueries(queryFilters, { throwOnError: true });
      })
    );
    if (results.some(result => result.status === 'rejected')) {
      this.recentEventIds.clear();
      this.recentEventIdOrder.length = 0;
      if (this.socket) this.forceReconnect(this.socket);
      return;
    }
    this.reconnectAttempt = 0;
  }

  private sendSubscription(scope: DebateGatewayScope, op: 'SUBSCRIBE' | 'UNSUBSCRIBE') {
    if (!this.readyForDebates || !this.socket || this.socket.readyState !== OPEN) return;
    const key = scopeKey(scope);
    if (op === 'SUBSCRIBE') {
      if (this.sentScopes.has(key)) return;
      this.sentScopes.add(key);
    }
    this.sendEnvelope(op, scope);
  }

  private sendHeartbeat() {
    this.clearTimer('heartbeat');
    if (!this.socket || this.socket.readyState !== OPEN) return;
    if (this.heartbeatsAwaitingAck >= 2) {
      this.forceReconnect(this.socket);
      return;
    }
    this.heartbeatsAwaitingAck += 1;
    this.sendEnvelope('HEARTBEAT', { debate_presence: true }, this.lastSequence);
    this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
  }

  private sendEnvelope(op: string, payload: unknown, seq: number | null = null) {
    if (!this.socket || this.socket.readyState !== OPEN) return;
    this.socket.send(
      JSON.stringify({
        v: 1,
        op,
        seq,
        request_id: null,
        space_id: null,
        room_id: null,
        room_kind: null,
        payload,
      })
    );
  }

  private scheduleTokenRotation(session: DebateGatewaySession) {
    this.clearTimer('token');
    const delay = Math.max(0, new Date(session.expires_at).getTime() - Date.now() - 30_000);
    this.tokenRotationTimer = setTimeout(() => {
      if (this.socket) this.forceReconnect(this.socket);
    }, delay);
  }

  private handleClose(socket: WebSocketLike) {
    if (socket !== this.socket) return;
    this.socket = null;
    this.readyForDebates = false;
    this.clearConnectionTimers();
    if (!this.enabled) return;
    this.setSnapshot({ status: 'degraded', paused: true });
    this.scheduleReconnect();
  }

  private forceReconnect(socket: WebSocketLike, minimumDelayMs = 0) {
    if (socket !== this.socket) return;
    this.socket = null;
    this.readyForDebates = false;
    this.clearConnectionTimers();
    socket.onclose = null;
    socket.close();
    if (!this.enabled) return;
    this.setSnapshot({ status: 'degraded', paused: true });
    this.scheduleReconnect(minimumDelayMs);
  }

  private scheduleReconnect(minimumDelayMs = 0) {
    if (!this.enabled || this.reconnectTimer) return;
    const baseDelay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt);
    const delay = Math.max(minimumDelayMs, Math.min(30_000, Math.round(baseDelay + baseDelay * 0.2 * this.random())));
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private disposeSocket() {
    const socket = this.socket;
    this.socket = null;
    this.readyForDebates = false;
    if (!socket) return;
    socket.onclose = null;
    socket.close();
  }

  private clearConnectionTimers() {
    this.clearTimer('heartbeat');
    this.clearTimer('handshake');
    this.clearTimer('token');
    this.heartbeatsAwaitingAck = 0;
  }

  private clearAllTimers() {
    this.clearConnectionTimers();
    this.clearTimer('reconnect');
    if (this.invalidationTimer) clearTimeout(this.invalidationTimer);
    this.invalidationTimer = null;
  }

  private clearTimer(timer: 'handshake' | 'heartbeat' | 'reconnect' | 'token') {
    const field =
      timer === 'handshake'
        ? 'handshakeTimer'
        : timer === 'heartbeat'
          ? 'heartbeatTimer'
          : timer === 'reconnect'
            ? 'reconnectTimer'
            : 'tokenRotationTimer';
    const current = this[field];
    if (current) clearTimeout(current);
    this[field] = null;
  }

  private setSnapshot(snapshot: DebateGatewaySnapshot) {
    if (snapshot.status === this.snapshot.status && snapshot.paused === this.snapshot.paused) return;
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

const debateGateway = new DebateGatewayClient({
  queryClient,
  getSession: getGeoChatSession,
  getApiBaseUrl: getGeoChatApiBaseUrl,
});

export function useDebateGateway(
  enabled: boolean,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  React.useEffect(() => {
    if (!enabled || !accountKey) {
      debateGateway.stop();
      return;
    }
    debateGateway.start(getPrivyIdentityToken, accountKey);
    return () => debateGateway.stop();
  }, [accountKey, enabled, getPrivyIdentityToken]);

  return React.useSyncExternalStore(debateGateway.subscribe, debateGateway.getSnapshot, debateGateway.getSnapshot);
}

export function useDebateGatewayScope(scope: DebateGatewayScope, enabled: boolean) {
  const scopeType = scope.scope;
  const scopeId = scope.scope === 'space' ? scope.space_id : scope.debate_id;

  React.useEffect(() => {
    if (!enabled || !scopeId) return;
    return debateGateway.retainScope(
      scopeType === 'space' ? { scope: 'space', space_id: scopeId } : { scope: 'debate', debate_id: scopeId }
    );
  }, [enabled, scopeId, scopeType]);
}

function gatewayWebSocketUrl(apiBaseUrl: string, accessToken: string) {
  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/gateway/ws`;
  url.search = '';
  url.searchParams.set('access_token', accessToken);
  return url.toString();
}

function scopeKey(scope: DebateGatewayScope) {
  return scope.scope === 'space' ? `space:${scope.space_id}` : `debate:${scope.debate_id}`;
}

function parseScope(value: unknown): DebateGatewayScope | null {
  if (!isRecord(value)) return null;
  if (value.scope === 'space' && typeof value.space_id === 'string') {
    return { scope: 'space', space_id: value.space_id };
  }
  if (value.scope === 'debate' && typeof value.debate_id === 'string') {
    return { scope: 'debate', debate_id: value.debate_id };
  }
  return null;
}

function isEventsLagged(payload: unknown) {
  return isRecord(payload) && payload.code === 'events_lagged';
}

function isRateLimited(payload: unknown) {
  return isRecord(payload) && payload.code === 'rate_limited';
}

function isSubscriptionLimitReached(payload: unknown) {
  return isRecord(payload) && payload.code === 'subscription_limit_reached';
}

function rateLimitRetryDelayMs(payload: unknown) {
  if (!isRecord(payload) || typeof payload.message !== 'string') return 1_000;
  const seconds = payload.message.match(/retry after (\d+) seconds/)?.[1];
  return seconds ? Number(seconds) * 1_000 : 1_000;
}

function isGatewayEnvelope(value: unknown): value is GatewayEnvelope {
  return isRecord(value) && value.v === 1 && typeof value.op === 'string' && 'payload' in value;
}

function isDebateEvent(value: unknown): value is DebateInvalidationEvent {
  return (
    isRecord(value) &&
    typeof value.event_id === 'string' &&
    typeof value.event_type === 'string' &&
    isRecord(value.payload)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
