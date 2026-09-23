import { ConnectionError, ConnectionErrorReason } from 'livekit-client';
import { describe, expect, it } from 'vitest';

import {
  type LiveKitConnectionErrorReason,
  debateRoomConnectionErrorMessage,
  debateRoomJoinFallbackMessage,
  isLiveKitConnectionError,
  liveKitConnectionErrorReason,
  liveKitConnectionErrorStatus,
} from './debate-connection-error';

/**
 * `ConnectionError`'s own constructor is protected, so every error here is built through a static
 * factory and then adjusted through this view — the same fields the SDK itself overwrites.
 */
type MutableConnectionError = { message: string; reason: number; status?: number };

/**
 * Reproduces what `Room.connect` actually throws: the handshake failure is caught, an outer
 * `serverUnreachable` error is built, and the inner error's `reason` and `status` are copied onto
 * it afterwards — leaving `reasonName` stale. This shape is the whole reason the helpers read the
 * numeric `reason`.
 */
function wrappedSignalFailure(inner: ConnectionError) {
  const outer = ConnectionError.serverUnreachable('could not establish signal connection');
  const mutable = outer as unknown as MutableConnectionError;
  mutable.message = `${outer.message}: ${inner.message}`;
  mutable.reason = inner.reason;
  mutable.status = inner.status;
  return outer;
}

function connectionErrorWithReason(reason: number, status?: number) {
  const error = ConnectionError.internal('boom');
  const mutable = error as unknown as MutableConnectionError;
  mutable.reason = reason;
  mutable.status = status;
  return error;
}

describe('liveKitConnectionErrorReason', () => {
  it('names every reason the SDK enum defines', () => {
    const names: Record<number, LiveKitConnectionErrorReason> = {};
    for (const reason of Object.values(ConnectionErrorReason)) {
      if (typeof reason !== 'number') continue;
      names[reason] = liveKitConnectionErrorReason(connectionErrorWithReason(reason));
    }

    expect(names).toEqual({
      [ConnectionErrorReason.NotAllowed]: 'NotAllowed',
      [ConnectionErrorReason.ServerUnreachable]: 'ServerUnreachable',
      [ConnectionErrorReason.InternalError]: 'InternalError',
      [ConnectionErrorReason.Cancelled]: 'Cancelled',
      [ConnectionErrorReason.LeaveRequest]: 'LeaveRequest',
      [ConnectionErrorReason.Timeout]: 'Timeout',
      [ConnectionErrorReason.WebSocket]: 'WebSocket',
      [ConnectionErrorReason.ServiceNotFound]: 'ServiceNotFound',
    });
  });

  it('reads the copied reason rather than the stale reasonName on a wrapped handshake failure', () => {
    const error = wrappedSignalFailure(ConnectionError.notAllowed('invalid API key', 401));

    expect(error.reasonName).toBe('ServerUnreachable');
    expect(liveKitConnectionErrorReason(error)).toBe('NotAllowed');
    expect(liveKitConnectionErrorStatus(error)).toBe(401);
  });

  it('returns unknown for non-LiveKit errors and for an unrecognised numeric reason', () => {
    expect(liveKitConnectionErrorReason(new Error('nope'))).toBe('unknown');
    expect(liveKitConnectionErrorReason(connectionErrorWithReason(99))).toBe('unknown');
    expect(liveKitConnectionErrorStatus(new Error('nope'))).toBeNull();
  });
});

describe('isLiveKitConnectionError', () => {
  it('matches a ConnectionError and nothing else', () => {
    expect(isLiveKitConnectionError(ConnectionError.timeout('slow'))).toBe(true);
    expect(isLiveKitConnectionError(new Error('ConnectionError'))).toBe(false);
    expect(isLiveKitConnectionError('ConnectionError')).toBe(false);
    expect(isLiveKitConnectionError(null)).toBe(false);
  });
});

describe('debateRoomConnectionErrorMessage', () => {
  it('replaces the "invalid API key" handshake failure with copy that points at us', () => {
    const error = wrappedSignalFailure(ConnectionError.notAllowed('invalid API key', 401));

    expect(error.message).toBe('could not establish signal connection: invalid API key');
    expect(debateRoomConnectionErrorMessage(error)).toBe(
      'The debate server turned down this connection. This is a problem on our end, not with your setup.'
    );
  });

  it('treats a 403 with an unrecognised reason as the same server-side rejection', () => {
    expect(debateRoomConnectionErrorMessage(connectionErrorWithReason(99, 403))).toBe(
      'The debate server turned down this connection. This is a problem on our end, not with your setup.'
    );
  });

  it('asks unreachable and timed-out connections to be retried', () => {
    expect(debateRoomConnectionErrorMessage(ConnectionError.timeout('signal timed out'))).toBe(
      'Could not reach the debate server. Check your connection, then reconnect.'
    );
    expect(
      debateRoomConnectionErrorMessage(wrappedSignalFailure(ConnectionError.serverUnreachable('websocket closed')))
    ).toBe('Could not reach the debate server. Check your connection, then reconnect.');
  });

  it('falls back to the generic message for LiveKit reasons with no copy of their own', () => {
    expect(debateRoomConnectionErrorMessage(ConnectionError.internal('unknown websocket error'))).toBe(
      debateRoomJoinFallbackMessage
    );
  });

  it('keeps the message of errors we did not author, so geo-chat rejections stay readable', () => {
    expect(debateRoomConnectionErrorMessage(new Error('This debate has already been cancelled.'))).toBe(
      'This debate has already been cancelled.'
    );
  });

  it('falls back when there is no message to show', () => {
    expect(debateRoomConnectionErrorMessage(new Error('   '))).toBe(debateRoomJoinFallbackMessage);
    expect(debateRoomConnectionErrorMessage('a string throw')).toBe(debateRoomJoinFallbackMessage);
  });
});
