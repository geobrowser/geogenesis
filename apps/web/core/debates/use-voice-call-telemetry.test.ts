import { act, renderHook } from '@testing-library/react';

import { ConnectionQuality, ConnectionState, DisconnectReason, ParticipantEvent, RoomEvent } from 'livekit-client';
import type { Room } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

const { VOICE_FIRST_SAMPLE_MS, VOICE_SAMPLE_MS, useVoiceCallTelemetry } = await import('./use-voice-call-telemetry');

type Listener = (...args: unknown[]) => void;

/** Just enough of a LiveKit room: events both ways, a mic publication and remote audio tracks. */
function fakeRoom() {
  const roomListeners = new Map<string, Set<Listener>>();
  const localListeners = new Map<string, Set<Listener>>();
  const on = (map: Map<string, Set<Listener>>) => (event: string, listener: Listener) => {
    if (!map.has(event)) map.set(event, new Set());
    map.get(event)!.add(listener);
  };
  const off = (map: Map<string, Set<Listener>>) => (event: string, listener: Listener) =>
    map.get(event)?.delete(listener);

  const mic = {
    label: 'MacBook Pro Microphone',
    stats: [] as Record<string, unknown>[],
  };
  const remote = { stats: [] as Record<string, unknown>[] };
  const room = {
    state: ConnectionState.Connected as ConnectionState,
    on: on(roomListeners),
    off: off(roomListeners),
    localParticipant: {
      connectionQuality: ConnectionQuality.Excellent,
      isMicrophoneEnabled: true,
      on: on(localListeners),
      off: off(localListeners),
      getTrackPublication: () => ({
        track: {
          mediaStreamTrack: { label: mic.label },
          getRTCStatsReport: async () => new Map(mic.stats.map((entry, index) => [`s${index}`, entry])),
        },
      }),
    },
    remoteParticipants: new Map([
      [
        'them',
        {
          audioTrackPublications: new Map([
            [
              'TR_them',
              {
                trackSid: 'TR_them',
                track: {
                  getRTCStatsReport: async () => new Map(remote.stats.map((entry, index) => [`r${index}`, entry])),
                },
              },
            ],
          ]),
        },
      ],
    ]),
  };
  const emit = (event: string, ...args: unknown[]) => roomListeners.get(event)?.forEach(listener => listener(...args));
  const emitLocal = (event: string, ...args: unknown[]) =>
    localListeners.get(event)?.forEach(listener => listener(...args));
  return { room: room as unknown as Room, raw: room, mic, remote, emit, emitLocal, roomListeners };
}

const events = (name: string) => capture.mock.calls.filter(([event]) => event === name).map(([, props]) => props);

describe('useVoiceCallTelemetry (GEO-3340)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capture.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('samples quality, loss each way and the mic, every interval while connected', async () => {
    const call = fakeRoom();
    call.mic.stats = [
      { type: 'outbound-rtp', kind: 'audio', packetsSent: 500 },
      { type: 'remote-inbound-rtp', kind: 'audio', packetsLost: 0, roundTripTime: 0.04 },
      { type: 'media-source', kind: 'audio', totalAudioEnergy: 0.1, totalSamplesDuration: 10 },
    ];
    call.remote.stats = [
      {
        type: 'inbound-rtp',
        kind: 'audio',
        packetsReceived: 500,
        packetsLost: 0,
        totalSamplesReceived: 480_000,
        concealedSamples: 0,
      },
    ];
    renderHook(() => useVoiceCallTelemetry(call.room, 'picker', 'session-1'));

    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_FIRST_SAMPLE_MS)));
    expect(events('debate_voice_sampled')).toEqual([
      expect.objectContaining({
        call_surface: 'picker',
        call_id: 'session-1',
        connection_quality: 'excellent',
        mic_enabled: true,
        mic_kind: 'built_in',
        rtt_ms: 40,
        send_loss_pct: 0,
        recv_concealed_pct: 0,
        recv_tracks: 1,
      }),
    ]);

    // The next interval reads the growth since the last one: here, a choppy stretch.
    call.mic.stats = [
      { type: 'outbound-rtp', kind: 'audio', packetsSent: 1_400 },
      { type: 'remote-inbound-rtp', kind: 'audio', packetsLost: 100, roundTripTime: 0.3 },
      { type: 'media-source', kind: 'audio', totalAudioEnergy: 0.1, totalSamplesDuration: 40 },
    ];
    call.remote.stats = [
      {
        type: 'inbound-rtp',
        kind: 'audio',
        packetsReceived: 1_400,
        packetsLost: 100,
        totalSamplesReceived: 1_920_000,
        concealedSamples: 144_000,
      },
    ];
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_SAMPLE_MS)));
    expect(events('debate_voice_sampled')[1]).toEqual(
      expect.objectContaining({ send_loss_pct: 10, recv_loss_pct: 10, recv_concealed_pct: 10, mic_level_db: -100 })
    );
  });

  // GEO-3343: the listener's connection fell back to TCP while the speaker's was on UDP.
  it('reports the transport each way, and a fallback mid-call', async () => {
    const path = (prefix: string, protocol: string) => [
      { id: `${prefix}T`, type: 'transport', selectedCandidatePairId: `${prefix}P` },
      { id: `${prefix}P`, type: 'candidate-pair', localCandidateId: `${prefix}L` },
      { id: `${prefix}L`, type: 'local-candidate', protocol, candidateType: 'host' },
    ];
    const call = fakeRoom();
    call.mic.stats = path('s', 'udp');
    call.remote.stats = path('r', 'udp');
    renderHook(() => useVoiceCallTelemetry(call.room, 'picker', 'session-1'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_FIRST_SAMPLE_MS)));
    expect(events('debate_voice_sampled')[0]).toEqual(
      expect.objectContaining({ send_transport: 'udp', recv_transport: 'udp' })
    );

    call.remote.stats = path('r', 'tcp');
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_SAMPLE_MS)));
    expect(events('debate_voice_sampled')[1]).toEqual(
      expect.objectContaining({ send_transport: 'udp', recv_transport: 'tcp' })
    );
    expect(events('debate_voice_changed')).toEqual([
      expect.objectContaining({ change: 'transport', direction: 'recv', transport: 'tcp', previous_transport: 'udp' }),
    ]);
  });

  it('summarises a call the viewer disconnected as left', () => {
    const call = fakeRoom();
    renderHook(() => useVoiceCallTelemetry(call.room, 'lobby', 'lobby-1'));
    act(() => call.emit(RoomEvent.Disconnected, DisconnectReason.CLIENT_INITIATED));
    expect(events('debate_voice_ended')).toEqual([expect.objectContaining({ end_reason: 'left' })]);
  });

  it('does not sample a room that is not connected', async () => {
    const call = fakeRoom();
    call.raw.state = ConnectionState.Reconnecting;
    renderHook(() => useVoiceCallTelemetry(call.room, 'lobby', 'lobby-1'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_SAMPLE_MS)));
    expect(events('debate_voice_sampled')).toEqual([]);
  });

  it('reports a move into poor quality, and not excellent and good trading places', () => {
    const call = fakeRoom();
    renderHook(() => useVoiceCallTelemetry(call.room, 'lobby', 'lobby-1'));

    act(() => call.emitLocal(ParticipantEvent.ConnectionQualityChanged, ConnectionQuality.Good));
    act(() => call.emitLocal(ParticipantEvent.ConnectionQualityChanged, ConnectionQuality.Poor));
    act(() => call.emitLocal(ParticipantEvent.ConnectionQualityChanged, ConnectionQuality.Good));

    expect(events('debate_voice_changed')).toEqual([
      expect.objectContaining({ change: 'quality', connection_quality: 'poor', previous_quality: 'good' }),
      expect.objectContaining({ change: 'quality', connection_quality: 'good', previous_quality: 'poor' }),
    ]);
  });

  it('reports a reconnect and how long it took', () => {
    const call = fakeRoom();
    renderHook(() => useVoiceCallTelemetry(call.room, 'picker', 'session-1'));

    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting));
    act(() => void vi.advanceTimersByTime(4_000));
    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected));

    expect(events('debate_voice_changed')).toEqual([
      expect.objectContaining({ change: 'reconnecting', signal_only: false }),
      expect.objectContaining({ change: 'reconnected', reconnect_ms: 4_000 }),
    ]);
  });

  it('summarises the call once when it drops, with time at poor quality and reconnects', () => {
    const call = fakeRoom();
    const { unmount } = renderHook(() => useVoiceCallTelemetry(call.room, 'picker', 'session-1'));

    act(() => call.emitLocal(ParticipantEvent.ConnectionQualityChanged, ConnectionQuality.Poor));
    act(() => void vi.advanceTimersByTime(20_000));
    act(() => call.emitLocal(ParticipantEvent.ConnectionQualityChanged, ConnectionQuality.Good));
    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting));
    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected));
    act(() => void vi.advanceTimersByTime(40_000));
    act(() => call.emit(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE));
    unmount();

    expect(events('debate_voice_changed').at(-1)).toEqual(
      // Named and attributed by the helpers community calls use, so the two read alike.
      expect.objectContaining({ change: 'disconnected', reason: 'SIGNAL_CLOSE', cause: 'unknown' })
    );
    expect(events('debate_voice_ended')).toEqual([
      expect.objectContaining({
        call_surface: 'picker',
        call_id: 'session-1',
        end_reason: 'disconnected',
        seconds_connected: 60,
        seconds_poor: 20,
        reconnects: 1,
      }),
    ]);
  });

  it('summarises a call the viewer left as left', () => {
    const call = fakeRoom();
    const { unmount } = renderHook(() => useVoiceCallTelemetry(call.room, 'lobby', 'lobby-1'));
    act(() => void vi.advanceTimersByTime(5_000));
    unmount();

    expect(events('debate_voice_ended')).toEqual([
      expect.objectContaining({ end_reason: 'left', seconds_connected: 5, reconnects: 0 }),
    ]);
  });

  it('says nothing at the end of a call that never connected', () => {
    const call = fakeRoom();
    call.raw.state = ConnectionState.Connecting;
    const { unmount } = renderHook(() => useVoiceCallTelemetry(call.room, 'lobby', 'lobby-1'));
    unmount();
    expect(events('debate_voice_ended')).toEqual([]);
  });

  it('reports a switch to a different kind of microphone, by kind only', async () => {
    const call = fakeRoom();
    renderHook(() => useVoiceCallTelemetry(call.room, 'picker', 'session-1'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_FIRST_SAMPLE_MS)));

    call.mic.label = 'AirPods Pro';
    act(() => call.emit(RoomEvent.ActiveDeviceChanged, 'audioinput', 'device-2'));

    const change = events('debate_voice_changed').at(-1);
    expect(change).toEqual(
      expect.objectContaining({ change: 'mic_device', mic_kind: 'bluetooth', previous_mic_kind: 'built_in' })
    );
    expect(JSON.stringify(capture.mock.calls)).not.toContain('AirPods');
    expect(JSON.stringify(capture.mock.calls)).not.toContain('MacBook');
  });

  it('stops listening when it unmounts', () => {
    const call = fakeRoom();
    const { unmount } = renderHook(() => useVoiceCallTelemetry(call.room, 'lobby', 'lobby-1'));
    unmount();
    for (const listeners of call.roomListeners.values()) expect(listeners.size).toBe(0);
  });
});
