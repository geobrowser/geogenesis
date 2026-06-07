import { describe, expect, it } from 'vitest';

import { getGatewaySocketAccessToken, parseGatewayEnvelope } from './use-space-chat-gateway';

describe('useSpaceChatGateway', () => {
  it('keeps member-room websocket subscriptions anonymous', () => {
    expect(getGatewaySocketAccessToken('member', 'app-token')).toBeNull();
  });

  it('uses app-session auth for editor-room websocket subscriptions', () => {
    expect(getGatewaySocketAccessToken('editor', 'app-token')).toBe('app-token');
  });

  it('omits browser auth for signed-out websocket subscriptions', () => {
    expect(getGatewaySocketAccessToken('member', null)).toBeNull();
  });

  it('accepts backend event frames that omit the protocol version', () => {
    expect(
      parseGatewayEnvelope(
        JSON.stringify({
          op: 'EVENT',
          room_id: 'room-id',
          payload: {
            event_type: 'message.created',
            payload: { message: { id: 'message-id' } },
          },
        })
      )
    ).toMatchObject({
      v: 1,
      op: 'EVENT',
      room_id: 'room-id',
    });
  });
});
