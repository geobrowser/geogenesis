import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { preferredRecordingMimeType, reportDebateRecorderFailure, startDebateRecorder } from './debate-recorder';

const analytics = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('~/core/analytics', () => analytics);

type FakeBehaviour = { throwOnConstruct?: Error; throwOnStart?: Error; supported?: string[] };

function fakeRecorder(behaviour: FakeBehaviour = {}) {
  const instances: FakeRecorder[] = [];
  class FakeRecorder extends EventTarget {
    static isTypeSupported(mimeType: string) {
      return (behaviour.supported ?? ['video/webm;codecs=vp9,opus']).includes(mimeType);
    }
    mimeType: string;
    state: RecordingState = 'inactive';
    startedWith: number | undefined;
    constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
      super();
      if (behaviour.throwOnConstruct) throw behaviour.throwOnConstruct;
      this.mimeType = options?.mimeType ?? '';
      instances.push(this);
    }
    start(timeslice?: number) {
      if (behaviour.throwOnStart) throw behaviour.throwOnStart;
      this.state = 'recording';
      this.startedWith = timeslice;
    }
  }
  return { Recorder: FakeRecorder as unknown as typeof MediaRecorder, instances };
}

const stream = {} as MediaStream;

describe('startDebateRecorder', () => {
  beforeEach(() => {
    analytics.capture.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('wires the recorder before starting it and reports nothing on success', () => {
    const { Recorder, instances } = fakeRecorder();
    const wire = vi.fn((recorder: MediaRecorder) => expect(recorder.state).toBe('inactive'));

    const started = startDebateRecorder({ stream, debateId: 'debate-1', timesliceMs: 1_000, wire, Recorder });

    expect(started?.recorder).toBe(instances[0]);
    expect(started?.mimeType).toBe('video/webm;codecs=vp9,opus');
    expect(wire).toHaveBeenCalledWith(instances[0], 'video/webm;codecs=vp9,opus');
    expect(instances[0].startedWith).toBe(1_000);
    expect(analytics.capture).not.toHaveBeenCalled();
  });

  it('reports a browser without MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const wire = vi.fn();

    const started = startDebateRecorder({
      stream,
      debateId: 'debate-1',
      timesliceMs: 1_000,
      wire,
      Recorder: undefined,
    });

    expect(started).toBeNull();
    expect(wire).not.toHaveBeenCalled();
    expect(analytics.capture).toHaveBeenCalledWith('debate_recorder_failed', {
      debate_id: 'debate-1',
      stage: 'unsupported',
      mime_type: 'none',
      error_name: null,
      error_message: null,
    });
  });

  it('reports a constructor throw instead of propagating it', () => {
    const error = new DOMException('Unsupported mimeType', 'NotSupportedError');
    const { Recorder } = fakeRecorder({ throwOnConstruct: error });
    const wire = vi.fn();

    expect(startDebateRecorder({ stream, debateId: 'debate-1', timesliceMs: 1_000, wire, Recorder })).toBeNull();
    expect(wire).not.toHaveBeenCalled();
    expect(analytics.capture).toHaveBeenCalledWith('debate_recorder_failed', {
      debate_id: 'debate-1',
      stage: 'construct',
      mime_type: 'video/webm;codecs=vp9,opus',
      error_name: 'NotSupportedError',
      error_message: 'Unsupported mimeType',
    });
    expect(console.warn).toHaveBeenCalledWith('[DebateRecording] local recorder failed at construct:', error);
  });

  it('reports a start() throw and returns no recorder', () => {
    const { Recorder } = fakeRecorder({
      supported: [],
      throwOnStart: new DOMException('No tracks', 'InvalidStateError'),
    });

    expect(
      startDebateRecorder({ stream, debateId: 'debate-1', timesliceMs: 1_000, wire: vi.fn(), Recorder })
    ).toBeNull();
    expect(analytics.capture).toHaveBeenCalledWith(
      'debate_recorder_failed',
      expect.objectContaining({ stage: 'start', mime_type: 'none', error_name: 'InvalidStateError' })
    );
  });

  it('reports an error the recorder fires after starting', () => {
    const { Recorder, instances } = fakeRecorder();
    startDebateRecorder({ stream, debateId: 'debate-1', timesliceMs: 1_000, wire: vi.fn(), Recorder });

    const event = Object.assign(new Event('error'), { error: new DOMException('Track ended', 'UnknownError') });
    instances[0].dispatchEvent(event);

    expect(analytics.capture).toHaveBeenCalledWith('debate_recorder_failed', {
      debate_id: 'debate-1',
      stage: 'runtime',
      mime_type: 'video/webm;codecs=vp9,opus',
      error_name: 'UnknownError',
      error_message: 'Track ended',
    });
  });

  it('routes every stage through an injected reporter', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const report = vi.fn();
    startDebateRecorder({
      stream,
      debateId: 'debate-1',
      timesliceMs: 1_000,
      wire: vi.fn(),
      report,
      Recorder: undefined,
    });

    expect(report).toHaveBeenCalledWith({ debateId: 'debate-1', stage: 'unsupported', mimeType: '' });
    expect(analytics.capture).not.toHaveBeenCalled();
  });
});

describe('reportDebateRecorderFailure', () => {
  it('never lets analytics throw into capture', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    analytics.capture.mockImplementationOnce(() => {
      throw new Error('posthog down');
    });

    expect(() => reportDebateRecorderFailure({ debateId: 'debate-1', stage: 'runtime', mimeType: '' })).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe('preferredRecordingMimeType', () => {
  it('picks the first supported WebM candidate, or none', () => {
    expect(preferredRecordingMimeType(fakeRecorder({ supported: ['video/webm'] }).Recorder)).toBe('video/webm');
    expect(preferredRecordingMimeType(fakeRecorder({ supported: [] }).Recorder)).toBe('');
    vi.stubGlobal('MediaRecorder', undefined);
    expect(preferredRecordingMimeType()).toBe('');
    vi.unstubAllGlobals();
  });
});
