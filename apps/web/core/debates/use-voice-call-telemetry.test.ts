import { act, cleanup, renderHook } from '@testing-library/react';

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
    /** The browser refuses the next stats read. */
    rejects: false,
  };
  const remote = {
    stats: [] as Record<string, unknown>[],
    /** Holds the next stats read open until the test lets it go. */
    hold: null as Promise<void> | null,
  };
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
          getRTCStatsReport: async () => {
            if (mic.rejects) throw new Error('stats unavailable');
            return new Map(mic.stats.map((entry, index) => [`s${index}`, entry]));
          },
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
                  getRTCStatsReport: async () => {
                    if (remote.hold) await remote.hold;
                    return new Map(remote.stats.map((entry, index) => [`r${index}`, entry]));
                  },
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
    // Unmounted between tests: a hook left mounted keeps its window listeners and answers the next
    // test's events.
    cleanup();
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

    // The next interval reads the growth since the last one: here, a choppy stretch. 100 of the 1,000
    // packets sent never arrived.
    call.mic.stats = [
      { type: 'outbound-rtp', kind: 'audio', packetsSent: 1_500 },
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

  // Copilot on #2884: an empty snapshot from a refused read became the baseline, so the next sample
  // reported the whole call's counters as one interval.
  it('skips a sample whose stats read is refused, keeping the last good baseline', async () => {
    const call = fakeRoom();
    const sent = (packets: number, lost: number) => [
      { type: 'outbound-rtp', kind: 'audio', packetsSent: packets, ssrc: 1 },
      { type: 'remote-inbound-rtp', kind: 'audio', packetsLost: lost },
    ];
    call.mic.stats = sent(10_000, 0);
    renderHook(() => useVoiceCallTelemetry(call.room, 'picker', 'session-1'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_FIRST_SAMPLE_MS)));

    call.mic.rejects = true;
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_SAMPLE_MS)));
    expect(events('debate_voice_sampled')).toHaveLength(1);

    call.mic.rejects = false;
    call.mic.stats = sent(11_000, 100);
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_SAMPLE_MS)));
    expect(events('debate_voice_sampled')[1]).toEqual(
      expect.objectContaining({ sent_packets: 1_000, send_loss_pct: 10 })
    );
  });

  // Copilot on #2884: the sample's mic interval ends when the sender is read. A mute after that,
  // while someone else's stats are still being read, belongs to the next interval.
  it('keeps a mute made during a later read for the next sample', async () => {
    const call = fakeRoom();
    const level = (energy: number, seconds: number) => [
      { type: 'media-source', kind: 'audio', totalAudioEnergy: energy, totalSamplesDuration: seconds },
    ];
    call.mic.stats = level(0.1, 10);
    renderHook(() => useVoiceCallTelemetry(call.room, 'picker', 'session-1'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_FIRST_SAMPLE_MS)));

    let letGo: () => void = () => undefined;
    call.remote.hold = new Promise(resolve => (letGo = resolve));
    call.mic.stats = level(0.4, 40);
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_SAMPLE_MS)));
    act(() => call.emitLocal(ParticipantEvent.TrackMuted, { source: 'microphone' }));
    call.remote.hold = null;
    await act(async () => letGo());

    call.mic.stats = level(0.4, 70);
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_SAMPLE_MS)));
    const [, second, third] = events('debate_voice_sampled');
    expect(second).toEqual(expect.objectContaining({ mic_level_db: -20 }));
    expect(third).toEqual(expect.objectContaining({ mic_level_db: null }));
  });

  // Copilot on #2884: sampling was timed from mount, so a slow join missed the early sample and a
  // short call reported none.
  it('times sampling from the connection, not from mount', async () => {
    const call = fakeRoom();
    call.raw.state = ConnectionState.Connecting;
    renderHook(() => useVoiceCallTelemetry(call.room, 'lobby', 'lobby-1'));

    await act(async () => void (await vi.advanceTimersByTimeAsync(12_000)));
    call.raw.state = ConnectionState.Connected;
    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected));
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_FIRST_SAMPLE_MS)));

    expect(events('debate_voice_sampled')).toEqual([expect.objectContaining({ seconds_connected: 10 })]);
  });

  // The receive side of the same rule: a resubscribed track is a new stream whose counters restart,
  // and must not read as no audio at all for the interval.
  it('measures a resubscribed remote track from its new stream', async () => {
    const call = fakeRoom();
    const heard = (ssrc: number, packets: number, lost: number) => [
      { type: 'inbound-rtp', kind: 'audio', ssrc, packetsReceived: packets, packetsLost: lost },
    ];
    call.remote.stats = heard(1, 50_000, 0);
    renderHook(() => useVoiceCallTelemetry(call.room, 'lobby', 'lobby-1'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_FIRST_SAMPLE_MS)));

    call.remote.stats = heard(2, 900, 100);
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_SAMPLE_MS)));
    expect(events('debate_voice_sampled')[1]).toEqual(expect.objectContaining({ recv_loss_pct: 10 }));
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

  it('reports a signal-only reconnect again when it turns into a full one', () => {
    const call = fakeRoom();
    renderHook(() => useVoiceCallTelemetry(call.room, 'lobby', 'lobby-1'));

    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.SignalReconnecting));
    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.SignalReconnecting));
    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting));
    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting));
    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected));

    expect(events('debate_voice_changed')).toEqual([
      expect.objectContaining({ change: 'reconnecting', signal_only: true }),
      expect.objectContaining({ change: 'reconnecting', signal_only: false }),
      expect.objectContaining({ change: 'reconnected', signal_only: false }),
    ]);
  });

  // A level averaged over a stretch muted and a stretch talking reads like a weak mic.
  it('leaves the mic level out of a sample whose interval spans a mute change', async () => {
    const call = fakeRoom();
    call.mic.stats = [{ type: 'media-source', kind: 'audio', totalAudioEnergy: 0.1, totalSamplesDuration: 10 }];
    renderHook(() => useVoiceCallTelemetry(call.room, 'picker', 'session-1'));

    act(() => call.emitLocal(ParticipantEvent.TrackUnmuted, { source: 'microphone' }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_FIRST_SAMPLE_MS)));
    call.mic.stats = [{ type: 'media-source', kind: 'audio', totalAudioEnergy: 0.4, totalSamplesDuration: 40 }];
    await act(async () => void (await vi.advanceTimersByTimeAsync(VOICE_SAMPLE_MS)));

    const [first, second] = events('debate_voice_sampled');
    expect(first).toEqual(expect.objectContaining({ mic_level_db: null }));
    expect(second).toEqual(expect.objectContaining({ mic_level_db: -20 }));
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

  // Copilot on #2884 (round 2): the summary is the last word on a call. Leaving the page summarises
  // it before LiveKit tears the room down, and nothing the room says after that may report.
  it('reports nothing after the summary, whatever the room says next', () => {
    const call = fakeRoom();
    renderHook(() => useVoiceCallTelemetry(call.room, 'picker', 'session-1'));

    act(() => void window.dispatchEvent(new Event('pagehide')));
    act(() => call.emitLocal(ParticipantEvent.ConnectionQualityChanged, ConnectionQuality.Lost));
    act(() => call.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting));
    act(() => call.emit(RoomEvent.Disconnected, DisconnectReason.CLIENT_INITIATED));
    call.mic.label = 'AirPods Pro';
    act(() => call.emit(RoomEvent.ActiveDeviceChanged, 'audioinput', 'device-2'));

    const names = capture.mock.calls.map(([event]) => event);
    expect(names.at(-1)).toBe('debate_voice_ended');
    expect(events('debate_voice_ended')).toEqual([expect.objectContaining({ end_reason: 'page_closed' })]);
  });

  it('stops listening when it unmounts', () => {
    const call = fakeRoom();
    const { unmount } = renderHook(() => useVoiceCallTelemetry(call.room, 'lobby', 'lobby-1'));
    unmount();
    for (const listeners of call.roomListeners.values()) expect(listeners.size).toBe(0);
  });
});
