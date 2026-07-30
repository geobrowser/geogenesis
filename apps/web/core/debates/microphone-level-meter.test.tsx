import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MicrophoneLevelMeter } from './microphone-level-meter';

type AudioHarness = ReturnType<typeof installAudioHarness>;

let audioHarness: AudioHarness;
let animationFrames: Map<number, FrameRequestCallback>;
let nextAnimationFrameId: number;

beforeEach(() => {
  animationFrames = new Map();
  nextAnimationFrameId = 1;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextAnimationFrameId++;
      animationFrames.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      animationFrames.delete(id);
    })
  );
  audioHarness = installAudioHarness();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MicrophoneLevelMeter', () => {
  it('starts with exactly 16 neutral segments', () => {
    render(<MicrophoneLevelMeter stream={audioStream().stream} />);

    const meter = screen.getByRole('meter');
    const segments = meter.querySelectorAll('[data-microphone-level-segment]');

    expect(segments).toHaveLength(16);
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '16');
    expect(meter).toHaveAccessibleName('Microphone level');
    expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(meter).toHaveAttribute('aria-valuetext', 'Microphone level unavailable');
    expect([...segments].every(segment => segment.classList.contains('bg-grey-02'))).toBe(true);
  });

  it.each([
    { name: 'silent', amplitude: 0, segments: 1, color: 'bg-red-01', description: 'No microphone signal' },
    {
      name: 'too low',
      amplitude: 0.01,
      segments: 7,
      color: 'bg-orange',
      description: 'Microphone volume too low',
    },
    { name: 'healthy', amplitude: 0.1, segments: 13, color: 'bg-green', description: 'Microphone volume good' },
  ])('renders a $name sample with the expected level and status', ({ amplitude, segments, color, description }) => {
    audioHarness.amplitude = amplitude;
    render(<MicrophoneLevelMeter stream={audioStream().stream} />);

    runNextAnimationFrame();

    const meter = screen.getByRole('meter');
    const renderedSegments = [...meter.querySelectorAll('[data-microphone-level-segment]')];
    expect(meter).toHaveAttribute('aria-valuenow', String(segments));
    expect(meter).toHaveAttribute('aria-valuetext', description);
    expect(renderedSegments.filter(segment => segment.classList.contains(color))).toHaveLength(segments);
    expect(renderedSegments.filter(segment => segment.classList.contains('bg-grey-02'))).toHaveLength(16 - segments);
  });

  it('releases gradually after applying louder samples immediately', () => {
    audioHarness.amplitude = 0.1;
    render(<MicrophoneLevelMeter stream={audioStream().stream} />);
    runNextAnimationFrame();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '13');

    audioHarness.amplitude = 0.001;
    runNextAnimationFrame();

    expect(Number(screen.getByRole('meter').getAttribute('aria-valuenow'))).toBeGreaterThan(4);
  });

  it('tears down the old analyser on stream replacement and never stops supplied tracks', () => {
    const first = audioStream();
    const second = audioStream();
    const view = render(<MicrophoneLevelMeter stream={first.stream} />);
    const firstContext = audioHarness.contexts[0];

    expect(firstContext?.createMediaStreamSource).toHaveBeenCalledWith(first.stream);

    view.rerender(<MicrophoneLevelMeter stream={second.stream} />);

    expect(firstContext?.source.disconnect).toHaveBeenCalledOnce();
    expect(firstContext?.analyser.disconnect).toHaveBeenCalledOnce();
    expect(firstContext?.analyser.connect).not.toHaveBeenCalled();
    expect(firstContext?.close).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(audioHarness.contexts[1]?.createMediaStreamSource).toHaveBeenCalledWith(second.stream);
    expect(first.track.stop).not.toHaveBeenCalled();

    audioHarness.amplitude = 0.1;
    runNextAnimationFrame();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '13');
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'Microphone volume good');

    view.unmount();

    expect(audioHarness.contexts[1]?.source.disconnect).toHaveBeenCalledOnce();
    expect(audioHarness.contexts[1]?.analyser.disconnect).toHaveBeenCalledOnce();
    expect(audioHarness.contexts[1]?.analyser.connect).not.toHaveBeenCalled();
    expect(audioHarness.contexts[1]?.close).toHaveBeenCalledOnce();
    expect(second.track.stop).not.toHaveBeenCalled();
  });

  it('keeps the neutral fallback when Web Audio setup throws synchronously', () => {
    const supplied = audioStream();
    audioHarness.createAnalyserError = new Error('Analyser unavailable');

    render(<MicrophoneLevelMeter stream={supplied.stream} />);

    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
    expect(audioHarness.contexts[0]?.source.disconnect).toHaveBeenCalledOnce();
    expect(audioHarness.contexts[0]?.close).toHaveBeenCalledOnce();
    expect(supplied.track.stop).not.toHaveBeenCalled();
    expect(animationFrames.size).toBe(0);
  });

  it('keeps the neutral fallback when no audio track is present', () => {
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream;

    render(<MicrophoneLevelMeter stream={stream} />);

    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
    expect(audioHarness.contexts).toHaveLength(0);
  });

  it('keeps the neutral fallback when the Web Audio API is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);

    render(<MicrophoneLevelMeter stream={audioStream().stream} />);

    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  });

  it('keeps the neutral fallback and cleans up when audio context startup is rejected', async () => {
    audioHarness.state = 'suspended';
    audioHarness.resume.mockRejectedValueOnce(new Error('Audio context blocked'));

    render(<MicrophoneLevelMeter stream={audioStream().stream} />);

    await waitFor(() => expect(audioHarness.contexts[0]?.close).toHaveBeenCalledOnce());
    expect(audioHarness.contexts[0]?.source.disconnect).toHaveBeenCalledOnce();
    expect(audioHarness.contexts[0]?.analyser.disconnect).toHaveBeenCalledOnce();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
    expect(animationFrames.size).toBe(0);
  });
});

function runNextAnimationFrame() {
  const entry = animationFrames.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (!entry) throw new Error('Expected a queued animation frame');
  animationFrames.delete(entry[0]);
  act(() => entry[1](performance.now()));
}

function audioStream() {
  const track = { kind: 'audio', stop: vi.fn() } as unknown as MediaStreamTrack;
  return {
    stream: { getAudioTracks: () => [track] } as unknown as MediaStream,
    track,
  };
}

function installAudioHarness() {
  const harness = {
    amplitude: 0,
    state: 'running' as AudioContextState,
    createAnalyserError: null as Error | null,
    resume: vi.fn().mockResolvedValue(undefined),
    contexts: [] as Array<{
      source: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
      analyser: {
        fftSize: number;
        connect: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
        getFloatTimeDomainData: ReturnType<typeof vi.fn>;
      };
      createMediaStreamSource: ReturnType<typeof vi.fn>;
      createAnalyser: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }>,
  };

  vi.stubGlobal(
    'AudioContext',
    class {
      state = harness.state;
      resume = harness.resume;
      close = vi.fn().mockResolvedValue(undefined);
      source = { connect: vi.fn(), disconnect: vi.fn() };
      analyser = {
        fftSize: 0,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getFloatTimeDomainData: vi.fn((samples: Float32Array) => samples.fill(harness.amplitude)),
      };
      createMediaStreamSource = vi.fn(() => this.source);
      createAnalyser = vi.fn(() => {
        if (harness.createAnalyserError) throw harness.createAnalyserError;
        return this.analyser;
      });

      constructor() {
        harness.contexts.push(this);
      }
    }
  );

  return harness;
}
