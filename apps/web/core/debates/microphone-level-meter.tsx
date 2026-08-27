'use client';

import * as React from 'react';

const SEGMENT_COUNT = 16;
const MIN_DECIBELS = -60;
const MAX_DECIBELS = -10;
const HEALTHY_DECIBELS = -35;
const GATE_OPEN_DECIBELS = -50;
const GATE_CLOSE_DECIBELS = -52;
const GATE_OPEN_DELAY_MS = 100;
const GATE_CLOSE_DELAY_MS = 300;
const RELEASE_DECIBELS_PER_SECOND = 60;

type MeterStatus = 'neutral' | 'silent' | 'low' | 'healthy';

type MeterState = {
  activeSegments: number;
  status: MeterStatus;
};

const NEUTRAL_STATE: MeterState = { activeSegments: 0, status: 'neutral' };
const SILENT_STATE: MeterState = { activeSegments: 1, status: 'silent' };

const statusPresentation: Record<MeterStatus, { color: string; description: string }> = {
  neutral: { color: 'bg-grey-02', description: 'Microphone level unavailable' },
  silent: { color: 'bg-red-01', description: 'No microphone signal' },
  low: { color: 'bg-orange', description: 'Microphone volume too low' },
  healthy: { color: 'bg-green', description: 'Microphone volume good' },
};

export function MicrophoneLevelMeter({ stream }: { stream: MediaStream | null }) {
  const [meter, setMeter] = React.useState<MeterState>(NEUTRAL_STATE);

  React.useEffect(() => {
    setMeter(NEUTRAL_STATE);

    const audioTrack = stream?.getAudioTracks()[0];
    const AudioContextConstructor = window.AudioContext;
    if (!stream || !audioTrack || !AudioContextConstructor) return;

    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let animationFrameId: number | null = null;
    let disposed = false;

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      source?.disconnect();
      analyser?.disconnect();
      if (context) void context.close().catch(() => undefined);
    };

    try {
      context = new AudioContextConstructor();
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
    } catch {
      dispose();
      return dispose;
    }

    const activeAnalyser = analyser;
    const samples = new Float32Array(activeAnalyser.fftSize);
    let previousDecibels: number | null = null;
    let previousTimestamp: number | null = null;
    let gateOpen = false;
    let gateTransitionStartedAt: number | null = null;

    const measure = (timestamp: number) => {
      if (disposed) return;

      activeAnalyser.getFloatTimeDomainData(samples);
      let sumOfSquares = 0;
      for (const sample of samples) sumOfSquares += sample * sample;
      const rms = Math.sqrt(sumOfSquares / samples.length);
      const rawDecibels = rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY;
      const clampedDecibels = Math.min(MAX_DECIBELS, Math.max(MIN_DECIBELS, rawDecibels));
      const elapsedSeconds = previousTimestamp === null ? 0 : Math.max(0, timestamp - previousTimestamp) / 1000;
      const decibels =
        previousDecibels === null || clampedDecibels >= previousDecibels
          ? clampedDecibels
          : Math.max(clampedDecibels, previousDecibels - RELEASE_DECIBELS_PER_SECOND * elapsedSeconds);
      previousDecibels = decibels;
      previousTimestamp = timestamp;

      const shouldTransitionGate = gateOpen ? rawDecibels < GATE_CLOSE_DECIBELS : rawDecibels > GATE_OPEN_DECIBELS;
      if (shouldTransitionGate) {
        gateTransitionStartedAt ??= timestamp;
        const transitionDelay = gateOpen ? GATE_CLOSE_DELAY_MS : GATE_OPEN_DELAY_MS;
        if (timestamp - gateTransitionStartedAt >= transitionDelay) {
          gateOpen = !gateOpen;
          gateTransitionStartedAt = null;
        }
      } else {
        gateTransitionStartedAt = null;
      }

      const nextMeter: MeterState = gateOpen
        ? {
            activeSegments:
              Math.round(((decibels - MIN_DECIBELS) / (MAX_DECIBELS - MIN_DECIBELS)) * (SEGMENT_COUNT - 1)) + 1,
            status: decibels <= MIN_DECIBELS ? 'silent' : decibels < HEALTHY_DECIBELS ? 'low' : 'healthy',
          }
        : SILENT_STATE;

      setMeter(current =>
        current.activeSegments === nextMeter.activeSegments && current.status === nextMeter.status ? current : nextMeter
      );
      animationFrameId = requestAnimationFrame(measure);
    };

    const start = async () => {
      try {
        if (context?.state === 'suspended') await context.resume();
        if (!disposed) animationFrameId = requestAnimationFrame(measure);
      } catch {
        dispose();
      }
    };

    void start();
    return dispose;
  }, [stream]);

  const presentation = statusPresentation[meter.status];

  return (
    <div
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={SEGMENT_COUNT}
      aria-valuenow={meter.activeSegments}
      aria-valuetext={presentation.description}
      className="flex h-2 w-[77px] shrink-0 items-center gap-[3px]"
    >
      {Array.from({ length: SEGMENT_COUNT }, (_, index) => {
        const active = index < meter.activeSegments;
        return (
          <span
            key={index}
            aria-hidden="true"
            data-microphone-level-segment
            className={`h-2 w-[2px] rounded-full ${active ? presentation.color : 'bg-grey-02'}`}
          />
        );
      })}
    </div>
  );
}
