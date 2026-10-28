import { RoomEvent, Track } from 'livekit-client';
import type { Room } from 'livekit-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PLAYBACK_CHECK_DELAY_MS, audioOutputFailure, debatePlaybackProbe } from './debate-playback-telemetry';

type Listener = (...args: unknown[]) => void;

type FakeElement = {
  paused: boolean;
  muted: boolean;
  isConnected: boolean;
  sinkId: string;
  videoWidth: number;
  clientWidth: number;
  clientHeight: number;
};

const element = (overrides: Partial<FakeElement> = {}): FakeElement => ({
  paused: false,
  muted: false,
  isConnected: true,
  sinkId: '',
  videoWidth: 640,
  clientWidth: 320,
  clientHeight: 180,
  ...overrides,
});

/** The opponent's publications as the debate room holds them: tracks with their attached elements. */
function fakeRoom() {
  const listeners = new Map<string, Set<Listener>>();
  const publications = new Map<Track.Source, Record<string, unknown>>();
  const room = {
    canPlaybackAudio: true,
    on: (event: string, listener: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off: (event: string, listener: Listener) => listeners.get(event)?.delete(listener),
    remoteParticipants: new Map([
      ['them', { getTrackPublication: (source: Track.Source) => publications.get(source) }],
    ]),
  };
  const publish = (
    source: Track.Source,
    { id, elements, stats = [] }: { id: string; elements: FakeElement[]; stats?: Record<string, unknown>[] }
  ) => {
    const track = {
      mediaStreamTrack: { id },
      attachedElements: elements,
      stats,
      getRTCStatsReport: async () => new Map(track.stats.map((entry, index) => [`s${index}`, entry])),
    };
    publications.set(source, { isMuted: false, track });
    return track;
  };
  const unpublish = (source: Track.Source) => publications.delete(source);
  const emit = (event: string, ...args: unknown[]) => listeners.get(event)?.forEach(listener => listener(...args));
  return { room: room as unknown as Room, raw: room, publish, unpublish, emit, listeners };
}

const inbound = (framesDecoded: number, timestamp: number, ssrc = 1) => [
  { type: 'inbound-rtp', kind: 'video', ssrc, framesDecoded, timestamp, frameHeight: 360 },
];

describe('debatePlaybackProbe (GEO-3511)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('reports the opponent becoming heard and seen once their tracks have settled', async () => {
    const call = fakeRoom();
    const report = vi.fn();
    debatePlaybackProbe(call.room, () => null)(report);

    call.emit(RoomEvent.ParticipantConnected);
    await vi.advanceTimersByTimeAsync(PLAYBACK_CHECK_DELAY_MS);
    call.publish(Track.Source.Microphone, { id: 'a1', elements: [element()] });
    call.publish(Track.Source.Camera, { id: 'v1', elements: [element()] });
    call.emit(RoomEvent.TrackSubscribed);
    call.emit(RoomEvent.TrackSubscribed);
    await vi.advanceTimersByTimeAsync(PLAYBACK_CHECK_DELAY_MS);

    expect(report.mock.calls.map(([change]) => change)).toEqual([
      { change: 'recv_audio', recv_audio_state: 'playing', previous_recv_audio_state: 'no_track' },
      { change: 'recv_video', recv_video_state: 'shown', previous_recv_video_state: 'no_track' },
    ]);
  });

  it('marks when the opponent stops being seen, and the new camera after they rejoin', async () => {
    const call = fakeRoom();
    const report = vi.fn();
    const probe = debatePlaybackProbe(call.room, () => null)(report);
    call.publish(Track.Source.Camera, { id: 'v1', elements: [element()] });
    await probe.sample();

    call.unpublish(Track.Source.Camera);
    call.emit(RoomEvent.TrackUnsubscribed);
    await vi.advanceTimersByTimeAsync(PLAYBACK_CHECK_DELAY_MS);
    call.publish(Track.Source.Camera, { id: 'v2', elements: [element({ clientWidth: 0, clientHeight: 0 })] });
    call.emit(RoomEvent.TrackSubscribed);
    await vi.advanceTimersByTimeAsync(PLAYBACK_CHECK_DELAY_MS);

    expect(report.mock.calls.map(([change]) => change.recv_video_state)).toEqual(['no_track', 'hidden']);
  });

  it('samples the decoded frame rate and layer, and calls a stalled picture frozen', async () => {
    const call = fakeRoom();
    const probe = debatePlaybackProbe(call.room, () => null)(vi.fn());
    const camera = call.publish(Track.Source.Camera, { id: 'v1', elements: [element()], stats: inbound(100, 10_000) });

    expect(await probe.sample()).toEqual(
      expect.objectContaining({ recv_video_state: 'shown', recv_video_fps: null, recv_video_height: 360 })
    );
    camera.stats = inbound(850, 40_000);
    expect(await probe.sample()).toEqual(expect.objectContaining({ recv_video_fps: 25, recv_video_state: 'shown' }));
    camera.stats = inbound(850, 70_000);
    expect(await probe.sample()).toEqual(expect.objectContaining({ recv_video_fps: 0, recv_video_state: 'frozen' }));
  });

  it('reports audio the browser refused to play', async () => {
    const call = fakeRoom();
    const report = vi.fn();
    const probe = debatePlaybackProbe(call.room, () => null)(report);
    call.publish(Track.Source.Microphone, { id: 'a1', elements: [element()] });
    await probe.sample();

    call.raw.canPlaybackAudio = false;
    call.emit(RoomEvent.AudioPlaybackStatusChanged, false);
    await vi.advanceTimersByTimeAsync(PLAYBACK_CHECK_DELAY_MS);

    expect(report).toHaveBeenCalledWith({
      change: 'recv_audio',
      recv_audio_state: 'blocked',
      previous_recv_audio_state: 'playing',
    });
    expect(await probe.sample()).toEqual(expect.objectContaining({ recv_audio_state: 'blocked' }));
  });

  it('reports a chosen speaker that is gone, and one the browser would not switch to', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices: async () => [{ kind: 'audiooutput', deviceId: 'default' }] },
    });
    const call = fakeRoom();
    const report = vi.fn();
    const probe = debatePlaybackProbe(call.room, () => 'spk-1')(report);
    call.publish(Track.Source.Microphone, { id: 'a1', elements: [element({ sinkId: 'spk-1' })] });

    expect(await probe.sample()).toEqual(expect.objectContaining({ audio_output: 'missing' }));
    const error = new DOMException('Requested device not found', 'NotFoundError');
    probe.audioOutputFailed(error);
    expect(report).toHaveBeenLastCalledWith({ change: 'audio_output_failed', reason: 'NotFoundError' });
  });

  it('names a failure by its kind only', () => {
    expect(audioOutputFailure(new DOMException('no', 'NotAllowedError'))).toBe('NotAllowedError');
    expect(audioOutputFailure(new Error('Device switch failed'))).toBe('switch_failed');
    expect(audioOutputFailure('weird')).toBe('switch_failed');
  });

  it('stops listening and checking when stopped', async () => {
    const call = fakeRoom();
    const report = vi.fn();
    const probe = debatePlaybackProbe(call.room, () => null)(report);
    call.emit(RoomEvent.TrackSubscribed);
    probe.stop();
    await vi.advanceTimersByTimeAsync(PLAYBACK_CHECK_DELAY_MS);
    for (const listeners of call.listeners.values()) expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
