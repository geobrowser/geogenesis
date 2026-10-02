import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RECORDING_LIMITER_SETTINGS,
  isRecordingAudioLimiterEnabled,
  prepareRecordingStream,
  reportRecordingLimiterFallback,
  roomAudioContextOf,
} from './recording-audio-limiter';

const telemetry = vi.hoisted(() => ({ reportEvent: vi.fn() }));
vi.mock('~/core/telemetry/logger', () => telemetry);

type FakeTrack = { kind: string; id: string; enabled: boolean; readyState: MediaStreamTrackState; stop: () => void };

function fakeTrack(kind: 'audio' | 'video', id: string): FakeTrack {
  const track: FakeTrack = {
    kind,
    id,
    enabled: true,
    readyState: 'live',
    stop: vi.fn(() => {
      track.readyState = 'ended';
    }),
  };
  return track;
}

class FakeMediaStream {
  constructor(public tracks: FakeTrack[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter(track => track.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter(track => track.kind === 'video');
  }
}

function fakeNode<T extends object>(extra: T) {
  return { connect: vi.fn(), disconnect: vi.fn(), ...extra };
}

const param = () => ({ value: 0 });

/**
 * A context whose nodes pass `enabled` through the way a real graph does: the destination track
 * outputs silence when the source track the source node reads is disabled.
 */
function fakeContext(state: AudioContextState = 'running') {
  const processedTrack = fakeTrack('audio', 'limited-audio');
  const context = {
    state,
    sources: [] as Array<ReturnType<typeof fakeNode<{ mediaStream: FakeMediaStream }>>>,
    gain: fakeNode({ gain: param() }),
    compressor: fakeNode({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    destination: fakeNode({ stream: new FakeMediaStream([processedTrack]) }),
    processedTrack,
    createMediaStreamSource: vi.fn((mediaStream: FakeMediaStream) => {
      const source = fakeNode({ mediaStream });
      context.sources.push(source);
      return source;
    }),
    createGain: vi.fn(() => context.gain),
    createDynamicsCompressor: vi.fn(() => context.compressor),
    createMediaStreamDestination: vi.fn(() => context.destination),
    close: vi.fn(() => Promise.resolve()),
  };
  return context;
}

type FakeContext = ReturnType<typeof fakeContext>;
const asContext = (context: FakeContext) => context as unknown as AudioContext;

describe('prepareRecordingStream', () => {
  let audio: FakeTrack;
  let video: FakeTrack;
  let stream: MediaStream;

  beforeEach(() => {
    vi.stubGlobal('MediaStream', FakeMediaStream);
    telemetry.reportEvent.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    audio = fakeTrack('audio', 'mic');
    video = fakeTrack('video', 'camera');
    stream = new FakeMediaStream([audio, video]) as unknown as MediaStream;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('is off unless NEXT_PUBLIC_DEBATE_RECORDING_LIMITER is 1', () => {
    expect(isRecordingAudioLimiterEnabled(undefined)).toBe(false);
    expect(isRecordingAudioLimiterEnabled('0')).toBe(false);
    expect(isRecordingAudioLimiterEnabled('true')).toBe(false);
    expect(isRecordingAudioLimiterEnabled('1')).toBe(true);

    vi.stubEnv('NEXT_PUBLIC_DEBATE_RECORDING_LIMITER', '');
    expect(isRecordingAudioLimiterEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_DEBATE_RECORDING_LIMITER', '1');
    expect(isRecordingAudioLimiterEnabled()).toBe(true);
  });

  it('returns the original stream untouched, and builds nothing, when the flag is off', () => {
    vi.stubEnv('NEXT_PUBLIC_DEBATE_RECORDING_LIMITER', '');
    const context = fakeContext();
    const createAudioContext = vi.fn(() => asContext(fakeContext()));
    const report = vi.fn();

    const result = prepareRecordingStream({
      stream,
      debateId: 'debate-1',
      audioContext: asContext(context),
      createAudioContext,
      report,
    });

    expect(result.stream).toBe(stream);
    expect(result.limited).toBe(false);
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
    expect(createAudioContext).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it('records the original video plus limited audio, reusing the running room context', () => {
    const context = fakeContext();
    const createAudioContext = vi.fn();

    const result = prepareRecordingStream({
      stream,
      debateId: 'debate-1',
      enabled: true,
      audioContext: asContext(context),
      createAudioContext,
    });

    expect(result.limited).toBe(true);
    expect(result.stream).not.toBe(stream);
    expect(result.stream.getVideoTracks()).toEqual([video]);
    expect(result.stream.getAudioTracks()).toEqual([context.processedTrack]);
    expect(createAudioContext).not.toHaveBeenCalled();
    // The source reads the recorded track itself, so `enabled` (the mic gate) reaches the graph.
    expect(context.sources[0]?.mediaStream.getTracks()).toEqual([audio]);
    expect(context.sources[0]?.connect).toHaveBeenCalledWith(context.gain);
    expect(context.gain.connect).toHaveBeenCalledWith(context.compressor);
    expect(context.compressor.connect).toHaveBeenCalledWith(context.destination);
    expect(context.gain.gain.value).toBeCloseTo(Math.pow(10, -4 / 20));
    expect(context.compressor.threshold.value).toBe(RECORDING_LIMITER_SETTINGS.thresholdDb);
    expect(context.compressor.ratio.value).toBe(20);
    expect(context.compressor.knee.value).toBe(0);
    expect(context.compressor.attack.value).toBe(0.002);
    expect(context.compressor.release.value).toBe(0.08);
    // The source track itself is left alone: it is also what LiveKit publishes.
    expect(audio.stop).not.toHaveBeenCalled();
  });

  it('creates its own context when the room has none, and closes only that one on dispose', () => {
    const owned = fakeContext();
    const result = prepareRecordingStream({
      stream,
      debateId: 'debate-1',
      enabled: true,
      audioContext: null,
      createAudioContext: () => asContext(owned),
    });

    expect(result.limited).toBe(true);
    result.dispose();
    result.dispose();
    expect(owned.close).toHaveBeenCalledOnce();
    expect(owned.processedTrack.stop).toHaveBeenCalledOnce();
    expect(owned.sources[0]?.disconnect).toHaveBeenCalledOnce();
    expect(owned.gain.disconnect).toHaveBeenCalledOnce();
    expect(owned.compressor.disconnect).toHaveBeenCalledOnce();

    const shared = fakeContext();
    prepareRecordingStream({ stream, debateId: 'debate-1', enabled: true, audioContext: asContext(shared) }).dispose();
    expect(shared.close).not.toHaveBeenCalled();
    expect(shared.processedTrack.stop).toHaveBeenCalledOnce();
  });

  it('falls back to the original stream when the only context available is suspended (iOS before a gesture)', () => {
    const suspended = fakeContext('suspended');
    const report = vi.fn();

    const result = prepareRecordingStream({
      stream,
      debateId: 'debate-1',
      enabled: true,
      audioContext: asContext(fakeContext('suspended')),
      createAudioContext: () => asContext(suspended),
      report,
    });

    expect(result.stream).toBe(stream);
    expect(result.limited).toBe(false);
    expect(suspended.close).toHaveBeenCalledOnce();
    expect(suspended.createMediaStreamSource).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith({ debateId: 'debate-1', reason: 'audio_context_not_running' });
  });

  it('falls back to the original stream when an AudioContext cannot be created', () => {
    const report = vi.fn();
    const error = new Error('AudioContext is not allowed');

    expect(
      prepareRecordingStream({
        stream,
        debateId: 'debate-1',
        enabled: true,
        createAudioContext: () => {
          throw error;
        },
        report,
      }).stream
    ).toBe(stream);
    expect(report).toHaveBeenCalledWith({ debateId: 'debate-1', reason: 'no_audio_context', error });

    expect(
      prepareRecordingStream({ stream, debateId: 'debate-1', enabled: true, createAudioContext: () => null, report })
        .stream
    ).toBe(stream);
    expect(report).toHaveBeenLastCalledWith({ debateId: 'debate-1', reason: 'no_audio_context' });
  });

  it('falls back to the original stream, and tears down what it built, when the graph throws', () => {
    const owned = fakeContext();
    const error = new DOMException('boom', 'InvalidStateError');
    owned.createDynamicsCompressor.mockImplementation(() => {
      throw error;
    });
    const report = vi.fn();

    const result = prepareRecordingStream({
      stream,
      debateId: 'debate-1',
      enabled: true,
      createAudioContext: () => asContext(owned),
      report,
    });

    expect(result.stream).toBe(stream);
    expect(result.limited).toBe(false);
    expect(owned.sources[0]?.disconnect).toHaveBeenCalled();
    expect(owned.close).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith({ debateId: 'debate-1', reason: 'graph_failed', error });
  });

  it('leaves a stream without exactly one audio track alone', () => {
    const videoOnly = new FakeMediaStream([video]) as unknown as MediaStream;
    const context = fakeContext();
    expect(
      prepareRecordingStream({ stream: videoOnly, debateId: 'd', enabled: true, audioContext: asContext(context) })
        .stream
    ).toBe(videoOnly);
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
  });

  it('ends the limited track once the microphone is stopped, so the recorded stream goes inactive as before', () => {
    vi.useFakeTimers();
    const context = fakeContext();
    prepareRecordingStream({ stream, debateId: 'debate-1', enabled: true, audioContext: asContext(context) });

    vi.advanceTimersByTime(5_000);
    expect(context.processedTrack.stop).not.toHaveBeenCalled();

    audio.stop();
    vi.advanceTimersByTime(1_000);
    expect(context.processedTrack.stop).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();
  });

  it('reports a fallback to Sentry once per debate and reason, warning on the console every time', () => {
    reportRecordingLimiterFallback({ debateId: 'debate-dedupe', reason: 'graph_failed', error: new Error('x') });
    reportRecordingLimiterFallback({ debateId: 'debate-dedupe', reason: 'graph_failed', error: new Error('x') });
    reportRecordingLimiterFallback({ debateId: 'debate-dedupe', reason: 'audio_context_not_running' });

    expect(console.warn).toHaveBeenCalledTimes(3);
    expect(telemetry.reportEvent).toHaveBeenCalledTimes(2);
    expect(telemetry.reportEvent).toHaveBeenNthCalledWith(1, {
      name: 'debate_recording_limiter_fallback',
      level: 'warning',
      tags: { reason: 'graph_failed', error_name: 'Error' },
      extra: { debate_id: 'debate-dedupe', error_message: 'x' },
    });
    expect(telemetry.reportEvent).toHaveBeenNthCalledWith(2, {
      name: 'debate_recording_limiter_fallback',
      level: 'warning',
      tags: { reason: 'audio_context_not_running', error_name: 'none' },
      extra: { debate_id: 'debate-dedupe', error_message: null },
    });
  });
});

describe('roomAudioContextOf', () => {
  it("reads the context LiveKit set on the local microphone track, which Krisp's processor also runs in", () => {
    const context = {} as AudioContext;
    expect(
      roomAudioContextOf([
        { mediaStreamTrack: { kind: 'video' } as MediaStreamTrack },
        { mediaStreamTrack: { kind: 'audio' } as MediaStreamTrack, audioContext: context } as never,
      ])
    ).toBe(context);
    expect(roomAudioContextOf([{ mediaStreamTrack: { kind: 'audio' } as MediaStreamTrack }])).toBeNull();
  });
});
