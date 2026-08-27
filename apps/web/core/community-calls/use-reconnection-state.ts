import * as React from 'react';

import { ConnectionState, DisconnectReason, Room } from 'livekit-client';

import { CallTelemetryContext, EpisodeOutcome, reportCallDisconnect } from './disconnect-telemetry';

/**
 * `ended` is the scheduled end-of-call cutoff. It can't be derived from the room's events:
 * the cutoff and a voluntary Leave both go through `room.disconnect()` and arrive as
 * CLIENT_INITIATED, so the caller that triggers it has to declare it via
 * `markEndedByCutoff()` beforehand (GEO-2584).
 */
export type ReconnectionStatus = 'connected' | 'reconnecting' | 'disconnected' | 'ended';

export type ReconnectionState = {
  /** Current connection status. */
  status: ReconnectionStatus;
  /** The reason for the most recent disconnect, if available. */
  disconnectReason: DisconnectReason | undefined;
  /** Reset state after a successful manual rejoin. */
  reset: () => void;
  /**
   * Declare that the disconnect about to happen is the scheduled cutoff, not a leave.
   * Call it immediately before `room.disconnect()`.
   */
  markEndedByCutoff: () => void;
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
 *
 * Also the reporting point for drop telemetry, since it is the one place that observes
 * every connection transition — see disconnect-telemetry.ts.
 */
export function useReconnectionState(
  room: Room,
  onPermanentDisconnect: () => void,
  /**
   * Identifies the call for drop telemetry. Optional so the hook stays usable and
   * testable standalone; when omitted, nothing is reported.
   */
  telemetry?: CallTelemetryContext
): ReconnectionState {
  const [status, setStatus] = React.useState<ReconnectionStatus>('connected');
  const [disconnectReason, setDisconnectReason] = React.useState<DisconnectReason | undefined>(undefined);
  const onPermanentDisconnectRef = React.useRef(onPermanentDisconnect);
  onPermanentDisconnectRef.current = onPermanentDisconnect;
  const lastDisconnectReasonRef = React.useRef<DisconnectReason | undefined>(undefined);
  const isMountedRef = React.useRef(true);

  // Read through a ref so a fresh context object each render can't restart the room's
  // event subscriptions, which would discard the episode currently being measured.
  const telemetryRef = React.useRef(telemetry);
  telemetryRef.current = telemetry;

  // Episode bookkeeping. `episodeStartedAt` doubles as "an outage is in progress": LiveKit
  // emits `reconnecting` and `signalReconnecting` repeatedly through one outage, so this is
  // what collapses that burst into a single episode with one outcome.
  const episodeStartedAtRef = React.useRef<number | null>(null);
  const joinedAtRef = React.useRef(Date.now());
  const endedByCutoffRef = React.useRef(false);
  // A single disconnect reaches us twice — once via the `disconnected` event and once via
  // `connectionStateChanged`. Setting state twice was harmless, but reporting twice would
  // double every count, so the terminal report is latched until the next reconnect.
  const reportedTerminalRef = React.useRef(false);

  const reportEpisode = React.useCallback((outcome: EpisodeOutcome, reason: DisconnectReason | undefined) => {
    const context = telemetryRef.current;
    const startedAt = episodeStartedAtRef.current;
    episodeStartedAtRef.current = null;
    if (!context) return;

    reportCallDisconnect(context, {
      outcome,
      reason,
      endedByCutoff: endedByCutoffRef.current,
      reconnectingMs: startedAt === null ? undefined : Date.now() - startedAt,
      // Measured from when the trouble started, not when it resolved, so "how far into the
      // call did this happen" isn't skewed by however long the retry ran.
      msSinceJoin: (startedAt ?? Date.now()) - joinedAtRef.current,
    });
  }, []);

  const markEndedByCutoff = React.useCallback(() => {
    endedByCutoffRef.current = true;
  }, []);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    const handleReconnecting = () => {
      // Only the first transition of an outage opens the episode — a later
      // `signalReconnecting` in the same outage must not reset its start time, or the
      // measured duration collapses to the last retry rather than the whole outage.
      if (episodeStartedAtRef.current === null) {
        episodeStartedAtRef.current = Date.now();
      }
      setStatus('reconnecting');
    };

    const handleReconnected = () => {
      // Fires on every Connected transition, including the initial connect and a manual
      // rejoin. Report only when an episode is actually open, so those aren't counted as
      // recoveries from a drop that never happened.
      if (episodeStartedAtRef.current !== null) {
        reportEpisode('recovered', lastDisconnectReasonRef.current);
      }
      reportedTerminalRef.current = false;
      lastDisconnectReasonRef.current = undefined;
      setDisconnectReason(undefined);
      setStatus('connected');
    };

    const handleDisconnected = (reason?: DisconnectReason) => {
      lastDisconnectReasonRef.current = reason;
      if (!isMountedRef.current) return;

      if (!reportedTerminalRef.current) {
        reportedTerminalRef.current = true;
        // An open episode means LiveKit had been retrying and has now exhausted its budget;
        // no episode means the disconnect was immediate, with nothing attempted.
        reportEpisode(episodeStartedAtRef.current === null ? 'left' : 'gave_up', reason);
      }

      // Checked before NAVIGATE_AWAY_REASONS: the cutoff arrives as CLIENT_INITIATED, and
      // navigating away on it is precisely the silent eject GEO-2584 is about.
      if (endedByCutoffRef.current) {
        setDisconnectReason(reason);
        setStatus('ended');
        return;
      }

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
  }, [room, reportEpisode]);

  const reset = React.useCallback(() => {
    // A manual rejoin starts a fresh connection, so the terminal latch has to lift or the
    // next drop in this session would go unreported.
    reportedTerminalRef.current = false;
    lastDisconnectReasonRef.current = undefined;
    setDisconnectReason(undefined);
    setStatus('connected');
  }, []);

  return { status, disconnectReason, reset, markEndedByCutoff };
}
