import * as React from 'react';

import { ConnectionState, DisconnectReason, Room } from 'livekit-client';

export type ReconnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export type ReconnectionState = {
  /** Current connection status. */
  status: ReconnectionStatus;
  /** The reason for the most recent disconnect, if available. */
  disconnectReason: DisconnectReason | undefined;
  /** Reset state after a successful manual rejoin. */
  reset: () => void;
};

/** CLIENT_INITIATED is a user-chosen leave, not a drop — handled as immediate navigation. */
const NAVIGATE_AWAY_REASONS = new Set([DisconnectReason.CLIENT_INITIATED]);

/**
 * Tracks LiveKit room reconnection state using both dedicated events and
 * connectionStateChanged for maximum reliability.
 *
 * - `reconnecting` / `signalReconnecting` -> show overlay with spinner
 * - `reconnected` / Connected -> dismiss overlay
 * - `disconnected` / Disconnected -> show manual rejoin UI with contextual messaging
 *
 * For user-initiated disconnects (CLIENT_INITIATED), calls `onPermanentDisconnect`
 * so the parent component can navigate away instead of showing the overlay. Admin
 * kicks, duplicate-tab drops, and network failures all show the overlay instead of
 * silently navigating away, so the user understands what happened.
 */
export function useReconnectionState(room: Room, onPermanentDisconnect: () => void): ReconnectionState {
  const [status, setStatus] = React.useState<ReconnectionStatus>('connected');
  const [disconnectReason, setDisconnectReason] = React.useState<DisconnectReason | undefined>(undefined);
  const onPermanentDisconnectRef = React.useRef(onPermanentDisconnect);
  onPermanentDisconnectRef.current = onPermanentDisconnect;
  const lastDisconnectReasonRef = React.useRef<DisconnectReason | undefined>(undefined);
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    const handleReconnecting = () => {
      setStatus('reconnecting');
    };

    const handleReconnected = () => {
      lastDisconnectReasonRef.current = undefined;
      setDisconnectReason(undefined);
      setStatus('connected');
    };

    const handleDisconnected = (reason?: DisconnectReason) => {
      lastDisconnectReasonRef.current = reason;
      if (!isMountedRef.current) return;

      if (reason !== undefined && NAVIGATE_AWAY_REASONS.has(reason)) {
        onPermanentDisconnectRef.current();
        return;
      }

      setDisconnectReason(reason);
      setStatus('disconnected');
    };

    const handleConnectionStateChanged = (state: ConnectionState) => {
      if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
        handleReconnecting();
      } else if (state === ConnectionState.Connected) {
        handleReconnected();
      } else if (state === ConnectionState.Disconnected) {
        handleDisconnected(lastDisconnectReasonRef.current);
      }
    };

    room.on('reconnecting', handleReconnecting);
    room.on('signalReconnecting', handleReconnecting);
    room.on('reconnected', handleReconnected);
    room.on('disconnected', handleDisconnected);
    room.on('connectionStateChanged', handleConnectionStateChanged);

    return () => {
      room.off('reconnecting', handleReconnecting);
      room.off('signalReconnecting', handleReconnecting);
      room.off('reconnected', handleReconnected);
      room.off('disconnected', handleDisconnected);
      room.off('connectionStateChanged', handleConnectionStateChanged);
    };
  }, [room]);

  const reset = React.useCallback(() => {
    lastDisconnectReasonRef.current = undefined;
    setDisconnectReason(undefined);
    setStatus('connected');
  }, []);

  return { status, disconnectReason, reset };
}
