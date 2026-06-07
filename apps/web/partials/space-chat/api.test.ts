import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRoomMessage,
  getGeoChatApiBaseUrl,
  getGeoChatWebSocketUrl,
  listRoomMessages,
  listSpaceRooms,
} from './api';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('space chat api client', () => {
  it('defaults to the same-origin proxy and direct local websocket URL', () => {
    expect(getGeoChatApiBaseUrl()).toBe('/api/geo-chat');
    expect(getGeoChatWebSocketUrl()).toBe('ws://127.0.0.1:18080/gateway/ws');
  });

  it('trims configured API base URLs and derives the websocket URL', () => {
    vi.stubEnv('NEXT_PUBLIC_GEO_CHAT_API_BASE_URL', 'https://chat.example.test/');

    expect(getGeoChatApiBaseUrl()).toBe('https://chat.example.test');
    expect(getGeoChatWebSocketUrl()).toBe('wss://chat.example.test/gateway/ws');
  });

  it('fetches space rooms with optional app-session auth', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rooms: [] }));

    await listSpaceRooms('dao space', { accessToken: 'app-token' });

    expect(fetchMock).toHaveBeenCalledWith('/api/geo-chat/spaces/dao%20space/rooms', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer app-token',
      },
    });
  });

  it('fetches room history with limit and cursor params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [], next_before: null }));

    await listRoomMessages({
      roomId: 'room-id',
      accessToken: null,
      limit: 25,
      beforeMessageId: 'before-id',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/geo-chat/rooms/room-id/messages?limit=25&before_message_id=before-id',
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('creates messages with a client nonce', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'message-id',
        room_id: 'room-id',
        room_kind: 'member',
        author_id: 'person-id',
        client_nonce: 'nonce',
        reply_to_message_id: null,
        body: 'Hello',
        attachment_ids: [],
        metadata: {},
        created_at: '2026-06-07T00:00:00Z',
        edited_at: null,
        deleted_at: null,
      })
    );

    await createRoomMessage({
      roomId: 'room-id',
      accessToken: 'app-token',
      clientNonce: 'nonce',
      body: 'Hello',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/geo-chat/rooms/room-id/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          client_nonce: 'nonce',
          body: 'Hello',
          reply_to_message_id: null,
          attachment_ids: [],
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer app-token',
        }),
      })
    );
  });

  it('maps stable backend error responses', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 'forbidden',
            message: 'No access',
            retry_after_seconds: 30,
          },
        },
        403,
        { 'x-request-id': 'request-id' }
      )
    );

    await expect(listSpaceRooms('dao-space')).rejects.toMatchObject({
      name: 'GeoChatApiError',
      code: 'forbidden',
      status: 403,
      retryAfterSeconds: 30,
      requestId: 'request-id',
      message: 'No access',
    });
  });
});

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}
