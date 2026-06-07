import { describe, expect, it } from 'vitest';

import type { GeoChatMessage, ListMessagesResponse, SpaceRoom } from './api';
import {
  createHeartbeatEnvelope,
  createMessagesQueryKey,
  createSubscribeEnvelope,
  reconcileGatewayEnvelope,
} from './gateway';

const room: SpaceRoom = {
  id: 'room-id',
  public_dao_space_id: 'public-space-id',
  space_id: 'dao-space',
  kind: 'member',
  key: 'dao-space::member',
};

describe('space chat gateway', () => {
  it('builds room subscription envelopes', () => {
    expect(createSubscribeEnvelope({ spaceId: 'dao-space', room, resumeAfterSeq: 42 })).toMatchObject({
      v: 1,
      op: 'SUBSCRIBE',
      seq: null,
      space_id: 'dao-space',
      room_id: 'room-id',
      room_kind: 'member',
      payload: {
        space_id: 'dao-space',
        room_id: 'room-id',
        room_kind: 'member',
        resume_after_seq: 42,
      },
    });
  });

  it('builds heartbeat envelopes with the last processed sequence', () => {
    expect(createHeartbeatEnvelope(7)).toMatchObject({
      v: 1,
      op: 'HEARTBEAT',
      seq: 7,
      payload: {},
    });
  });

  it('keeps message history cache scoped to the room across auth changes', () => {
    expect(createMessagesQueryKey('room-id')).toEqual(['space-chat', 'messages', 'room-id']);
  });

  it('appends message.created events and dedupes repeated messages', () => {
    const first = reconcileGatewayEnvelope(undefined, {
      v: 1,
      op: 'EVENT',
      seq: 1,
      request_id: null,
      space_id: null,
      room_id: room.id,
      room_kind: room.kind,
      payload: {
        event_type: 'message.created',
        payload: {
          type: 'created',
          message: message({ id: 'message-id', body: 'Hello' }),
        },
      },
    });

    expect(first.next?.messages).toHaveLength(1);

    const repeated = reconcileGatewayEnvelope(first.next, {
      v: 1,
      op: 'EVENT',
      seq: 2,
      request_id: null,
      space_id: null,
      room_id: room.id,
      room_kind: room.kind,
      payload: {
        event_type: 'message.created',
        payload: {
          type: 'created',
          message: message({ id: 'message-id', body: 'Hello again' }),
        },
      },
    });

    expect(repeated.next?.messages).toHaveLength(1);
    expect(repeated.next?.messages[0]?.body).toBe('Hello again');
  });

  it('dedupes created messages with dashed and dashless ids', () => {
    const history: ListMessagesResponse = {
      messages: [message({ id: '11111111-2222-4333-8444-555555555555', body: 'Before' })],
      next_before: null,
    };

    const reconciled = reconcileGatewayEnvelope(history, {
      v: 1,
      op: 'EVENT',
      seq: 1,
      request_id: null,
      space_id: null,
      room_id: room.id,
      room_kind: room.kind,
      payload: {
        event_type: 'message.created',
        payload: {
          type: 'created',
          message: message({ id: '11111111222243338444555555555555', body: 'After' }),
        },
      },
    });

    expect(reconciled.next?.messages).toHaveLength(1);
    expect(reconciled.next?.messages[0]?.body).toBe('After');
  });

  it('handles direct message event payloads', () => {
    const reconciled = reconcileGatewayEnvelope(undefined, {
      v: 1,
      op: 'EVENT',
      seq: 1,
      request_id: null,
      space_id: null,
      room_id: room.id,
      room_kind: room.kind,
      payload: {
        type: 'created',
        message: message({ id: 'message-id', body: 'Direct payload' }),
      },
    });

    expect(reconciled).toMatchObject({
      shouldRefetch: false,
      next: {
        messages: [
          {
            id: 'message-id',
            body: 'Direct payload',
          },
        ],
      },
    });
  });

  it('handles production message payloads without requiring duplicate type fields', () => {
    const reconciled = reconcileGatewayEnvelope(undefined, {
      v: 1,
      op: 'EVENT',
      seq: 1,
      request_id: null,
      space_id: null,
      room_id: room.id,
      room_kind: room.kind,
      payload: {
        payload: {
          message: message({ id: 'message-id', body: 'Backend payload' }),
        },
      },
    });

    expect(reconciled).toMatchObject({
      shouldRefetch: false,
      next: {
        messages: [
          {
            id: 'message-id',
            body: 'Backend payload',
          },
        ],
      },
    });
  });

  it('handles Kafka-wrapped message payloads', () => {
    const reconciled = reconcileGatewayEnvelope(undefined, {
      v: 1,
      op: 'EVENT',
      seq: 1,
      request_id: null,
      space_id: null,
      room_id: room.id,
      room_kind: room.kind,
      payload: {
        topic: 'geo-chat-events',
        payload: {
          event_type: 'message.created',
          payload: {
            message: message({ id: 'message-id', body: 'Kafka wrapped' }),
          },
        },
      },
    });

    expect(reconciled.next?.messages[0]?.body).toBe('Kafka wrapped');
    expect(reconciled.shouldRefetch).toBe(false);
  });

  it('recognizes alternate backend message event names', () => {
    const reconciled = reconcileGatewayEnvelope(undefined, {
      v: 1,
      op: 'EVENT',
      seq: 1,
      request_id: null,
      space_id: null,
      room_id: room.id,
      room_kind: room.kind,
      payload: {
        event_type: 'chat.message_created',
        payload: {
          message: message({ id: 'message-id', body: 'Alternate event name' }),
        },
      },
    });

    expect(reconciled.next?.messages[0]?.body).toBe('Alternate event name');
    expect(reconciled.shouldRefetch).toBe(false);
  });

  it('applies message edit and delete events', () => {
    const history: ListMessagesResponse = {
      messages: [message({ id: 'message-id', body: 'Before' })],
      next_before: null,
    };

    const edited = reconcileGatewayEnvelope(history, {
      v: 1,
      op: 'EVENT',
      seq: 1,
      request_id: null,
      space_id: null,
      room_id: room.id,
      room_kind: room.kind,
      payload: {
        event_type: 'message.edited',
        payload: {
          type: 'edited',
          message_id: 'message-id',
          body: 'After',
          edited_at: '2026-06-07T00:01:00Z',
        },
      },
    });

    expect(edited.next?.messages[0]).toMatchObject({
      body: 'After',
      edited_at: '2026-06-07T00:01:00Z',
    });

    const deleted = reconcileGatewayEnvelope(edited.next, {
      v: 1,
      op: 'EVENT',
      seq: 2,
      request_id: null,
      space_id: null,
      room_id: room.id,
      room_kind: room.kind,
      payload: {
        event_type: 'message.deleted',
        payload: {
          type: 'deleted',
          message_id: 'message-id',
          deleted_at: '2026-06-07T00:02:00Z',
        },
      },
    });

    expect(deleted.next?.messages[0]?.deleted_at).toBe('2026-06-07T00:02:00Z');
  });

  it('requests HTTP reconciliation when gateway events lag', () => {
    expect(
      reconcileGatewayEnvelope(undefined, {
        v: 1,
        op: 'ERROR',
        seq: null,
        request_id: null,
        space_id: null,
        room_id: null,
        room_kind: null,
        payload: {
          code: 'events_lagged',
          message: 'connection skipped retained room events',
        },
      }).shouldRefetch
    ).toBe(true);
  });

  it('requests HTTP reconciliation for unrecognized event payloads', () => {
    expect(
      reconcileGatewayEnvelope(undefined, {
        v: 1,
        op: 'EVENT',
        seq: 1,
        request_id: null,
        space_id: null,
        room_id: room.id,
        room_kind: room.kind,
        payload: {
          event_type: 'message.created',
          unexpected: true,
        },
      }).shouldRefetch
    ).toBe(true);
  });
});

function message({ id, body }: { id: string; body: string }): GeoChatMessage {
  return {
    id,
    room_id: room.id,
    room_kind: room.kind,
    author_id: '11111111222243338444555555555555',
    client_nonce: `nonce:${id}`,
    reply_to_message_id: null,
    body,
    attachment_ids: [],
    metadata: {},
    created_at: '2026-06-07T00:00:00Z',
    edited_at: null,
    deleted_at: null,
  };
}
