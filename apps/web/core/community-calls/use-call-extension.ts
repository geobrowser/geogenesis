'use client';

import { useDataChannel } from '@livekit/components-react';

import * as React from 'react';

import { RoomEvent } from 'livekit-client';
import type { Room } from 'livekit-client';

import { parseParticipantMetadata } from './types';

/** How much one press of Extend buys. */
export const CALL_EXTENSION_MS = 15 * 60 * 1000;

/**
 * Ceiling on total extension, so a call left open by accident still ends. Four presses;
 * past that the room is being used as a standing space, not an overrunning meeting.
 */
export const MAX_CALL_EXTENSION_MS = 60 * 60 * 1000;

const CUTOFF_TOPIC = 'call-cutoff';

/**
 * Shared, editor-controlled extension of a call's hard cutoff.
 *
 * The cutoff is enforced independently by each client — every participant runs its own
 * `CallEndTimer` and disconnects itself. So an extension is only meaningful if every client
 * agrees on it: a host who extended locally would keep talking while everyone else was
 * dropped at the original time, which is worse than no extension at all.
 *
 * Agreement is reached over the data channel rather than through room metadata. Metadata
 * would be the more durable home — `useRecordingMetadataSync` uses it, and a late joiner
 * would read it for free — but writing it requires the server API, and this is deliberately
 * a client-only change.
 *
 * Two properties make the broadcast safe without coordination:
 *
 * - **Monotonic.** Receivers take the larger of what they hold and what they were sent, so
 *   messages may arrive repeatedly, out of order, or late without ever shortening a call.
 *   That is what lets anyone holding an extension rebroadcast on a join, which is how a late
 *   joiner learns the cutoff has moved.
 * - **Editor-gated on receipt, not just on send.** Any participant can publish data, so a
 *   sender-side check would only be a UI courtesy. The extension is honoured only when the
 *   sending participant's own metadata says they are an editor — the same `isEditor` the
 *   participants panel and the last-editor warning read.
 */
export function useCallExtension({ room, canExtend }: { room: Room; canExtend: boolean }) {
  const [extensionMs, setExtensionMs] = React.useState(0);

  // Read by the rebroadcast effect and the send callback, neither of which should re-run
  // (and re-subscribe, or churn the button identity) every time the value changes.
  const extensionRef = React.useRef(0);
  extensionRef.current = extensionMs;

  const applyExtension = React.useCallback((next: number) => {
    if (!Number.isFinite(next) || next <= 0) return;
    const clamped = Math.min(next, MAX_CALL_EXTENSION_MS);
    setExtensionMs(current => (clamped > current ? clamped : current));
  }, []);

  const { send } = useDataChannel(CUTOFF_TOPIC, msg => {
    if (!parseParticipantMetadata(msg.from?.metadata).isEditor) return;
    try {
      const decoded = JSON.parse(new TextDecoder().decode(msg.payload));
      if (typeof decoded?.extensionMs === 'number') applyExtension(decoded.extensionMs);
    } catch {
      // ignore malformed payloads
    }
  });

  const broadcast = React.useCallback(
    (value: number) => {
      send(new TextEncoder().encode(JSON.stringify({ extensionMs: value })), { reliable: true });
    },
    [send]
  );

  /**
   * Someone who joins after the extension was announced never saw the message. Whoever holds
   * an extension re-announces it when a participant connects; `applyExtension`'s max makes
   * the duplicate arrivals at everyone else harmless.
   */
  React.useEffect(() => {
    const onParticipantConnected = () => {
      if (extensionRef.current > 0) broadcast(extensionRef.current);
    };
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
    };
  }, [room, broadcast]);

  const extend = React.useCallback(() => {
    if (!canExtend) return;
    const next = Math.min(extensionRef.current + CALL_EXTENSION_MS, MAX_CALL_EXTENSION_MS);
    if (next === extensionRef.current) return;
    applyExtension(next);
    broadcast(next);
  }, [canExtend, applyExtension, broadcast]);

  return {
    /** Added to the occurrence's scheduled end, moving both the warning banner and the cutoff. */
    extensionMs,
    extend,
    canExtendFurther: canExtend && extensionMs < MAX_CALL_EXTENSION_MS,
  };
}
