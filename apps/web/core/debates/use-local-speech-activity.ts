'use client';

import * as React from 'react';

import { decibelsFromSamples, initialSpeechGateState, stepSpeechGate } from './speech-activity';

/**
 * Whether the local speaker is talking right now, from their own microphone signal.
 *
 * GEO-2915 needs this to decide when a turn's overrun has finished. A fixed window cannot work:
 * sentences are not all the same length, so any number is too short for some speakers and adds
 * dead air for the rest. The signal itself knows.
 *
 * Reads the track directly rather than LiveKit's `isSpeaking`, which is derived from what the SFU
 * receives and is therefore subject to publication, and is exactly what gets switched off at the
 * buzzer. This has to observe the source, because the whole question is whether to keep publishing.
 *
 * Returns a ref rather than state on purpose. It changes several times a second, and the only
 * consumer is a gate read during render — driving re-renders from it would re-render the debate
 * room continuously for the entire debate.
 */
export function useLocalSpeechActivity(stream: MediaStream | null, enabled: boolean): React.RefObject<boolean> {
  const speakingRef = React.useRef(false);

  React.useEffect(() => {
    if (!enabled || !stream || typeof window === 'undefined') {
      speakingRef.current = false;
      return;
    }
    const track = stream.getAudioTracks()[0];
    if (!track) {
      speakingRef.current = false;
      return;
    }

    let disposed = false;
    let frame: number | null = null;
    let context: AudioContext | null = null;

    const dispose = () => {
      disposed = true;
      speakingRef.current = false;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      void context?.close().catch(() => undefined);
      context = null;
    };

    let analyser: AnalyserNode;
    try {
      context = new AudioContext();
      // A stream of our own: attaching to the shared preview stream would tie this to whatever
      // else is reading it, and the track may be replaced when a processor is attached.
      const source = context.createMediaStreamSource(new MediaStream([track]));
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
    } catch {
      // No AudioContext (unsupported, or blocked before a gesture). Reporting "not speaking" means
      // the overrun never opens, which is the behaviour from before this existed.
      dispose();
      return dispose;
    }

    const samples = new Float32Array(analyser.fftSize);
    let gate = initialSpeechGateState;

    const measure = (timestamp: number) => {
      if (disposed) return;
      analyser.getFloatTimeDomainData(samples);
      gate = stepSpeechGate(gate, decibelsFromSamples(samples), timestamp);
      speakingRef.current = gate.open;
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);

    return dispose;
  }, [enabled, stream]);

  return speakingRef;
}
