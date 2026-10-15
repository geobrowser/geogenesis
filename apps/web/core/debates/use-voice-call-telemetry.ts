'use client';

import * as React from 'react';

import {
  ConnectionQuality,
  ConnectionState,
  type DisconnectReason,
  type LocalAudioTrack,
  ParticipantEvent,
  type RemoteAudioTrack,
  type Room,
  RoomEvent,
  Track,
  type TrackPublication,
} from 'livekit-client';

import { captureSafely } from '~/core/analytics-capture-safely';
import { disconnectCause, disconnectReasonName } from '~/core/livekit/disconnect-reason';

import {
  type MicKind,
  type ReceiverSnapshot,
  type SenderSnapshot,
  type VoiceTransport,
  micKindOf,
  readReceiverReport,
  readSenderReport,
  readTransport,
  statsEntries,
  voiceSampleMetrics,
} from './voice-call-stats';

export type VoiceCallSurface = 'picker' | 'lobby';

export const VOICE_SAMPLE_MS = 30_000;
/** The first sample comes sooner, so a short call still reports its loss. */
export const VOICE_FIRST_SAMPLE_MS = 10_000;

/** Excellent and good trade places constantly; only a move involving poor or lost is news. */
const NOTABLE_QUALITIES = new Set<ConnectionQuality>([ConnectionQuality.Poor, ConnectionQuality.Lost]);

/**
 * Call quality for the pre-debate voice calls (GEO-3340): the claim picker and the lobby.
 *
 * Until this, a report that someone's mic was choppy had nothing to be checked against: analytics
 * saw a join, an unmute and a few clicks on Audio settings. Network loss, a dropped connection, a
 * microphone sending silence and a Bluetooth headset each need a different fix, and each looks the
 * same from there. Three events tell them apart:
 *
 * - `debate_voice_sampled` every {@link VOICE_SAMPLE_MS} while connected (and once early): the
 *   connection quality LiveKit reports, packet loss each way, round trip, jitter, how much of what we
 *   heard had to be concealed, the microphone's own level, what kind of microphone it is, and the
 *   transport each way (UDP, TCP or a relay: a TCP fallback is what made GEO-3343 choppy).
 * - `debate_voice_changed` the moment something moves: quality into or out of poor or lost, a
 *   reconnect starting or finishing, a disconnect with its reason, a different kind of microphone,
 *   a different transport.
 * - `debate_voice_ended` once per call: seconds connected, seconds at poor and lost quality,
 *   reconnects, the worst loss and concealment seen, and the last transport each way.
 *
 * All three carry `call_surface` and `call_id` (the rematch session or the lobby), so picker and
 * lobby read with the same queries. Device labels never leave the browser: only their kind does.
 *
 * Runs entirely on refs and room events, never state: a call that re-rendered on every stats read
 * would be the kind of cost this exists to find.
 */
export function useVoiceCallTelemetry(room: Room, surface: VoiceCallSurface, callId: string) {
  React.useEffect(() => {
    const base = { call_surface: surface, call_id: callId };
    const local = room.localParticipant;

    let connectedAt: number | null = room.state === ConnectionState.Connected ? Date.now() : null;
    let quality = local.connectionQuality;
    let qualitySince = Date.now();
    let poorSeconds = 0;
    let lostSeconds = 0;
    let reconnectingSince: number | null = null;
    /** The open reconnect has gone past signal-only: the audio had a gap. */
    let reconnectingFully = false;
    /** Muted or unmuted since the last sample, so that sample's level would mix silence in. */
    let muteChanged = false;
    let reconnects = 0;
    let samples = 0;
    let worstSendLoss: number | null = null;
    let worstConcealed: number | null = null;
    let previousSender: SenderSnapshot | undefined;
    let previousReceivers: Map<string, ReceiverSnapshot> | undefined;
    let sampling = false;
    let ended = false;

    /** Every change reports through here, so nothing follows the call's summary. */
    const reportChange = (change: Record<string, unknown>) => {
      if (!ended) captureSafely('debate_voice_changed', { ...base, ...change });
    };

    const micKind = trackSwitches<MicKind>((next, previous) =>
      reportChange({ change: 'mic_device', mic_kind: next, previous_mic_kind: previous })
    );
    // What we send and what we hear ride separate connections, and either can fall back on its own.
    const transportSwitches = (direction: 'send' | 'recv') =>
      trackSwitches<VoiceTransport>((next, previous) =>
        reportChange({ change: 'transport', direction, transport: next, previous_transport: previous })
      );
    const sendTransport = transportSwitches('send');
    const recvTransport = transportSwitches('recv');

    const secondsSince = (at: number | null) => (at === null ? 0 : Math.round((Date.now() - at) / 1_000));

    const settleQuality = () => {
      const now = Date.now();
      const seconds = (now - qualitySince) / 1_000;
      if (quality === ConnectionQuality.Poor) poorSeconds += seconds;
      if (quality === ConnectionQuality.Lost) lostSeconds += seconds;
      qualitySince = now;
    };

    const micTrack = () => local.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined;

    /** An unpublished mic has no label, and is not a device change. */
    const noteMicKind = () => {
      const kind = micKindOf(micTrack()?.mediaStreamTrack?.label);
      micKind.note(kind === 'unknown' ? null : kind);
    };

    const sample = async () => {
      if (sampling || ended || room.state !== ConnectionState.Connected) return;
      sampling = true;
      // Whether this sample's mic interval, which ends at the sender read, spans a mute change. Put
      // back if the sample is dropped, since the next one then measures from the same baseline.
      let spansMuteChange = false;
      let committed = false;
      try {
        noteMicKind();
        // A refused read throws out of the sample, which is dropped: an empty snapshot taken as the
        // baseline would make the next sample report the whole call as one interval.
        const senderEntries = statsEntries(await micTrack()?.getRTCStatsReport());
        const sender = readSenderReport(senderEntries);
        const sentOver = readTransport(senderEntries);
        spansMuteChange = muteChanged;
        muteChanged = false;

        const receivers = new Map<string, ReceiverSnapshot>();
        let heardOver: VoiceTransport | null = null;
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.audioTrackPublications.values()) {
            const remote = publication.track as RemoteAudioTrack | undefined;
            if (!remote || !publication.trackSid) continue;
            const entries = statsEntries(await remote.getRTCStatsReport());
            const received = readReceiverReport(entries);
            // By stream as well as track: a resubscribed track is a new stream whose counters restart.
            receivers.set(`${publication.trackSid}:${received.streamId ?? ''}`, received);
            // Every remote track arrives over the one subscriber connection.
            heardOver ??= readTransport(entries);
          }
        }
        // The call can end during any of the reads above; nothing reports after its summary.
        if (ended) return;
        sendTransport.note(sentOver);
        recvTransport.note(heardOver);

        const metrics = voiceSampleMetrics(sender, previousSender, receivers, previousReceivers);
        // A level averaged across a mute change reads as a weak mic, so it is left out instead.
        if (spansMuteChange) metrics.mic_level_db = null;
        committed = true;
        previousSender = sender;
        previousReceivers = receivers;
        samples += 1;
        worstSendLoss = worstOf(worstSendLoss, metrics.send_loss_pct);
        worstConcealed = worstOf(worstConcealed, metrics.recv_concealed_pct);

        captureSafely('debate_voice_sampled', {
          ...base,
          connection_quality: quality,
          mic_enabled: local.isMicrophoneEnabled,
          mic_kind: micKind.current() ?? 'unknown',
          send_transport: sendTransport.current(),
          recv_transport: recvTransport.current(),
          seconds_connected: secondsSince(connectedAt),
          ...metrics,
        });
      } finally {
        if (!committed) muteChanged ||= spansMuteChange;
        sampling = false;
      }
    };

    const finish = (endReason: 'left' | 'disconnected' | 'page_closed') => {
      if (ended) return;
      ended = true;
      // A call that never came up has nothing to summarise; its failure is the disconnect event.
      if (connectedAt === null) return;
      settleQuality();
      captureSafely('debate_voice_ended', {
        ...base,
        end_reason: endReason,
        seconds_connected: secondsSince(connectedAt),
        seconds_poor: Math.round(poorSeconds),
        seconds_lost: Math.round(lostSeconds),
        reconnects,
        samples,
        worst_send_loss_pct: worstSendLoss,
        worst_recv_concealed_pct: worstConcealed,
        mic_kind: micKind.current() ?? 'unknown',
        send_transport: sendTransport.current(),
        recv_transport: recvTransport.current(),
      });
    };

    // Timed from the connection, not from mount: a slow join would otherwise miss the early sample,
    // and a short call would report none.
    let first: ReturnType<typeof setTimeout> | undefined;
    let every: ReturnType<typeof setInterval> | undefined;
    const startSampling = () => {
      if (first !== undefined) return;
      // A failed read is a lost sample, never an unhandled rejection in the middle of a call.
      const sampleSafely = () => void sample().catch(() => undefined);
      first = setTimeout(sampleSafely, VOICE_FIRST_SAMPLE_MS);
      every = setInterval(sampleSafely, VOICE_SAMPLE_MS);
    };

    const onConnectionState = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) {
        if (connectedAt === null) connectedAt = Date.now();
        startSampling();
        if (reconnectingSince !== null) {
          reconnects += 1;
          reportChange({
            change: 'reconnected',
            reconnect_ms: Date.now() - reconnectingSince,
            signal_only: !reconnectingFully,
          });
          reconnectingSince = null;
          reconnectingFully = false;
        }
        return;
      }
      if (state !== ConnectionState.Reconnecting && state !== ConnectionState.SignalReconnecting) return;
      // Signal-only reconnects keep media flowing; a full one is a gap in the audio. One that starts
      // signal-only and then goes further is reported again when it does.
      const fully = state === ConnectionState.Reconnecting;
      if (reconnectingSince !== null && (reconnectingFully || !fully)) return;
      reconnectingSince ??= Date.now();
      reconnectingFully = fully;
      reportChange({ change: 'reconnecting', signal_only: !fully });
    };

    // Named and attributed as community calls do, so one reason reads the same in both.
    const onDisconnected = (reason?: DisconnectReason) => {
      const cause = disconnectCause(reason);
      reportChange({ change: 'disconnected', reason: disconnectReasonName(reason), cause });
      finish(cause === 'intentional' ? 'left' : 'disconnected');
    };

    const onQuality = (next: ConnectionQuality) => {
      if (next === quality) return;
      settleQuality();
      const previous = quality;
      quality = next;
      if (!NOTABLE_QUALITIES.has(next) && !NOTABLE_QUALITIES.has(previous)) return;
      reportChange({ change: 'quality', connection_quality: next, previous_quality: previous });
    };

    const onActiveDevice = (kind: MediaDeviceKind) => {
      if (kind === 'audioinput') noteMicKind();
    };

    const onPageHide = () => finish('page_closed');

    const onMuteChange = (publication: TrackPublication) => {
      if (publication.source === Track.Source.Microphone) muteChanged = true;
    };

    room.on(RoomEvent.ConnectionStateChanged, onConnectionState);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.ActiveDeviceChanged, onActiveDevice);
    room.on(RoomEvent.LocalTrackPublished, noteMicKind);
    local.on(ParticipantEvent.ConnectionQualityChanged, onQuality);
    local.on(ParticipantEvent.TrackMuted, onMuteChange);
    local.on(ParticipantEvent.TrackUnmuted, onMuteChange);
    window.addEventListener('pagehide', onPageHide);

    if (connectedAt !== null) startSampling();

    return () => {
      clearTimeout(first);
      clearInterval(every);
      room.off(RoomEvent.ConnectionStateChanged, onConnectionState);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.ActiveDeviceChanged, onActiveDevice);
      room.off(RoomEvent.LocalTrackPublished, noteMicKind);
      local.off(ParticipantEvent.ConnectionQualityChanged, onQuality);
      local.off(ParticipantEvent.TrackMuted, onMuteChange);
      local.off(ParticipantEvent.TrackUnmuted, onMuteChange);
      window.removeEventListener('pagehide', onPageHide);
      finish('left');
    };
  }, [callId, room, surface]);
}

/** The larger of two readings, either of which may be missing. */
function worstOf(worst: number | null, reading: number | null) {
  return reading === null ? worst : Math.max(worst ?? 0, reading);
}

/**
 * Remembers a value and reports a move between two it could name. A first reading is not a change,
 * and `null` (nothing measurable yet) neither sets nor clears it.
 */
function trackSwitches<T extends string>(report: (next: T, previous: T) => void) {
  let value: T | null = null;
  return {
    current: () => value,
    note: (next: T | null) => {
      if (next === null || next === value) return;
      const previous = value;
      value = next;
      if (previous !== null) report(next, previous);
    },
  };
}
