import * as React from 'react';

import type { OpenRoundPick } from './api';
import { audioContextClass } from './debate-request-alert';

/**
 * Short sound effects for the Open rounds recording room (GEO-3319).
 *
 * Every moment of an Open rounds debate used to be silent — the count-in, Go, the pick, the reveal,
 * a new round, the wrap — so a debater looking at their notes missed them. Each moment now has its
 * own sound, built from what the moment is about: a clock for time, a bell for Go, a rubber stamp
 * for a pick. They are the set tuned by ear in the stamps mockup, synthesised like the request
 * alert's chime (`debate-request-alert.ts`), so nothing is downloaded to play them.
 *
 * **They must never reach a recording.** Each debater's recording is their own microphone, and a
 * debater on speakers puts everything the page plays back into that microphone. The browser's echo
 * canceller already removes the other debater's voice, but only because that voice arrives over
 * WebRTC: Chrome's canceller hears what WebRTC plays and nothing else, so a sound played straight
 * from Web Audio would be recorded in full. So the effects take the same road the voice does — out
 * of Web Audio into a WebRTC connection the page makes with itself, and back out of an `<audio>`
 * element on the speaker the debater picked. To the canceller they are one more remote voice.
 * Where that connection cannot be made, the effects stay silent rather than risk the recording.
 *
 * Everything passes one bus — a gentle top cut and a compressor — so two sounds landing together
 * (two stamps into a banner) never clip, and every sound sits at a similar level under the voices.
 */

const NOTE = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5 } as const;

type Voice = {
  context: AudioContext;
  bus: AudioNode;
  noise: AudioBuffer;
};

function envelope(gain: GainNode, t0: number, peak: number, duration: number, attack = 0.004) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
}

function tone(
  { context, bus }: Voice,
  frequency: number,
  duration: number,
  {
    type = 'sine',
    gain = 0.12,
    to,
    at = 0,
    attack,
  }: { type?: OscillatorType; gain?: number; to?: number; at?: number; attack?: number } = {}
) {
  const t0 = context.currentTime + at;
  const oscillator = context.createOscillator();
  const amp = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, t0);
  if (to) oscillator.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  envelope(amp, t0, gain, duration, attack);
  oscillator.connect(amp).connect(bus);
  oscillator.start(t0);
  oscillator.stop(t0 + duration + 0.05);
}

function noise(
  { context, bus, noise: buffer }: Voice,
  duration: number,
  {
    type = 'bandpass',
    frequency = 2000,
    to,
    q = 1,
    gain = 0.2,
    at = 0,
    attack,
  }: {
    type?: BiquadFilterType;
    frequency?: number;
    to?: number;
    q?: number;
    gain?: number;
    at?: number;
    attack?: number;
  } = {}
) {
  const t0 = context.currentTime + at;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const amp = context.createGain();
  source.buffer = buffer;
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(frequency, t0);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  envelope(amp, t0, gain, duration, attack);
  source.connect(filter).connect(amp).connect(bus);
  source.start(t0);
  source.stop(t0 + duration + 0.05);
}

/** A struck bell: a few inharmonic partials, the high ones dying first. */
function bell(voice: Voice, frequency: number, duration: number, { gain = 0.12, at = 0 } = {}) {
  for (const [ratio, level, length] of [
    [1, 1, 1],
    [2.0, 0.45, 0.6],
    [3.01, 0.22, 0.4],
    [4.17, 0.12, 0.25],
  ]) {
    tone(voice, frequency * ratio, duration * length, { gain: gain * level, at });
  }
}

/** A wooden clock tick; the tock sits a little lower. */
function clockTick(voice: Voice, at = 0, high = true, gain = 1) {
  noise(voice, 0.035, { frequency: high ? 3400 : 2600, q: 6, gain: 0.5 * gain, at });
  tone(voice, high ? 1250 : 940, 0.045, { type: 'triangle', gain: 0.07 * gain, at });
}

/** A rubber stamp: the thump of the handle, the slap of the paper. Pitch and weight carry the pick. */
function thump(voice: Voice, from: number, to: number, gain: number, slap: number) {
  tone(voice, from, 0.2, { gain, to });
  if (slap) {
    noise(voice, 0.07, { type: 'lowpass', frequency: 1400, gain: 0.45 * slap });
    noise(voice, 0.02, { frequency: 4000, q: 3, gain: 0.12 * slap });
  }
}

function wrap(voice: Voice) {
  noise(voice, 0.32, { frequency: 4000, to: 600, q: 1.2, gain: 0.12, attack: 0.06 });
  [NOTE.G5, NOTE.E5, NOTE.C5].forEach((frequency, k) =>
    tone(voice, frequency, k === 2 ? 0.7 : 0.16, { type: 'triangle', gain: 0.08, at: 0.1 + k * 0.13 })
  );
}

const ROOM_SOUNDS = {
  // Count-in: the first two ticks quieter, so it builds toward the turn.
  tickSoft: voice => clockTick(voice, 0, true, 0.5),
  tockSoft: voice => clockTick(voice, 0, false, 0.5),
  tick: voice => clockTick(voice, 0, true),
  tock: voice => clockTick(voice, 0, false),
  tickLast: voice => {
    clockTick(voice, 0, true, 1.2);
    tone(voice, 1568, 0.08, { type: 'triangle', gain: 0.05 });
  },
  // A short tail: the speaker starts talking on Go.
  go: voice => {
    bell(voice, NOTE.C6, 0.45, { gain: 0.16 });
    noise(voice, 0.05, { type: 'highpass', frequency: 5000, gain: 0.08 });
  },
  // Under the speaker's own voice, so quiet and over in half a second.
  hurry: voice => [0, 0.16, 0.29, 0.39, 0.47].forEach((at, k) => clockTick(voice, at, k % 2 === 0, 0.45 + k * 0.05)),
  handoff: voice => {
    noise(voice, 0.28, { frequency: 3200, to: 500, q: 1.5, gain: 0.16, attack: 0.03 });
    clockTick(voice, 0.27, false, 0.8);
  },
  question: voice => {
    tone(voice, NOTE.E5, 0.14, { type: 'triangle', gain: 0.09 });
    tone(voice, NOTE.G5, 0.22, { type: 'triangle', gain: 0.09, to: NOTE.C6, at: 0.13 });
  },
  pickTick: voice => clockTick(voice, 0, true, 0.75),
  pickExtend: voice => {
    clockTick(voice, 0, true, 0.7);
    tone(voice, NOTE.G5, 0.09, { type: 'triangle', gain: 0.08, to: NOTE.C6, at: 0.01 });
  },
  pickEnd: voice => {
    clockTick(voice, 0, false, 0.7);
    tone(voice, NOTE.E5, 0.1, { type: 'triangle', gain: 0.08, to: NOTE.C5, at: 0.01 });
  },
  stampExtend: voice => {
    thump(voice, 160, 50, 0.5, 1);
    tone(voice, NOTE.G5, 0.12, { type: 'triangle', gain: 0.05, at: 0.03 });
  },
  stampEnd: voice => thump(voice, 115, 38, 0.6, 1),
  stampNone: voice => thump(voice, 90, 50, 0.22, 0.25),
  roundUp: voice => {
    noise(voice, 0.32, { frequency: 500, to: 4500, q: 1.2, gain: 0.12, attack: 0.08 });
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((frequency, k) =>
      tone(voice, frequency, k === 3 ? 0.4 : 0.14, { type: 'triangle', gain: 0.08, at: 0.12 + k * 0.08 })
    );
  },
  wrap,
  max: voice => {
    wrap(voice);
    bell(voice, NOTE.C5, 1.4, { gain: 0.1, at: 0.4 });
  },
  endsoon: voice => {
    bell(voice, NOTE.G4, 0.9, { gain: 0.11 });
    bell(voice, NOTE.G4, 0.9, { gain: 0.09, at: 0.45 });
  },
  thanks: voice =>
    [NOTE.C5, NOTE.E5, NOTE.G5].forEach((frequency, k) =>
      tone(voice, frequency, 1.3, { gain: 0.05, at: k * 0.05, attack: 0.06 })
    ),
  ready: voice => {
    tone(voice, NOTE.E5, 0.1, { gain: 0.07 });
    tone(voice, NOTE.A5, 0.25, { gain: 0.07, at: 0.1 });
  },
} satisfies Record<string, (voice: Voice) => void>;

export type RoomSound = keyof typeof ROOM_SOUNDS;

/** The stamp a pick lands with. */
export function stampSound(pick: OpenRoundPick | null | undefined): RoomSound {
  return pick === 'extend' ? 'stampExtend' : pick === 'end' ? 'stampEnd' : 'stampNone';
}

/**
 * The count-in's tick for `secondsLeft`: the last one rings, the two before it are full ticks and
 * anything earlier is soft, alternating tick and tock so it reads as a clock.
 */
export function countInSound(secondsLeft: number): RoomSound {
  if (secondsLeft <= 1) return 'tickLast';
  const tick = secondsLeft % 2 === 1;
  if (secondsLeft <= 3) return tick ? 'tick' : 'tock';
  return tick ? 'tickSoft' : 'tockSoft';
}

// ---------------------------------------------------------------------------------------------
// The output: Web Audio → loopback WebRTC → <audio>, so the echo canceller treats it as a voice.
// ---------------------------------------------------------------------------------------------

export type RoomSoundEngine = {
  play: (sound: RoomSound) => void;
  setOutputDevice: (deviceId: string) => void;
  dispose: () => void;
};

/**
 * Connects `stream` to itself through two local peer connections and returns what comes out the far
 * side. Host candidates only: both ends are this page, so no server is involved.
 */
async function loopback(stream: MediaStream): Promise<{ stream: MediaStream; close: () => void }> {
  const sender = new RTCPeerConnection();
  const receiver = new RTCPeerConnection();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    clearTimeout(timeout);
    sender.close();
    receiver.close();
  };
  try {
    sender.onicecandidate = event => {
      if (event.candidate) void receiver.addIceCandidate(event.candidate).catch(() => undefined);
    };
    receiver.onicecandidate = event => {
      if (event.candidate) void sender.addIceCandidate(event.candidate).catch(() => undefined);
    };
    const received = new Promise<MediaStream>((resolve, reject) => {
      receiver.ontrack = event => resolve(event.streams[0] ?? new MediaStream([event.track]));
      timeout = setTimeout(() => reject(new Error('Sound effect loopback timed out.')), 5_000);
    });
    // Handled here as well as awaited below: a negotiation step that throws first leaves this
    // promise unawaited, and its timeout must not surface as an unhandled rejection.
    received.catch(() => undefined);
    for (const track of stream.getAudioTracks()) sender.addTrack(track, stream);
    const offer = await sender.createOffer();
    await sender.setLocalDescription(offer);
    await receiver.setRemoteDescription(offer);
    const answer = await receiver.createAnswer();
    await receiver.setLocalDescription(answer);
    await sender.setRemoteDescription(answer);
    const looped = await received;
    clearTimeout(timeout);
    return { stream: looped, close };
  } catch (error) {
    close();
    throw error;
  }
}

/**
 * Starts the room's sound output. Resolves to null wherever it cannot be made safe — no Web Audio,
 * no WebRTC, or the loopback failed — and the room is then silent, as it was before.
 */
export async function createRoomSoundEngine(): Promise<RoomSoundEngine | null> {
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass || typeof RTCPeerConnection === 'undefined') return null;

  let context: AudioContext | null = null;
  let closeLoopback: (() => void) | null = null;
  let element: HTMLAudioElement | null = null;
  try {
    context = new AudioContextClass();
    void context.resume().catch(() => undefined);

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 8000;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;
    const bus = context.createGain();
    bus.gain.value = 0.8;
    const destination = context.createMediaStreamDestination();
    bus.connect(lowpass).connect(compressor).connect(destination);

    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let k = 0; k < samples.length; k++) samples[k] = Math.random() * 2 - 1;

    const looped = await loopback(destination.stream);
    closeLoopback = looped.close;
    element = new Audio();
    element.autoplay = true;
    element.srcObject = looped.stream;
    const sinkable = element as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    // An empty id is the system default, which is also how a debater switches back to it.
    const setSink = (deviceId: string) => void sinkable.setSinkId?.(deviceId).catch(() => undefined);
    void element.play().catch(() => undefined);

    const voice: Voice = { context, bus, noise: buffer };
    const audio = element;
    const ownContext = context;
    const ownClose = closeLoopback;
    return {
      play: sound => {
        try {
          if (ownContext.state === 'suspended') void ownContext.resume().catch(() => undefined);
          if (audio.paused) void audio.play().catch(() => undefined);
          ROOM_SOUNDS[sound](voice);
        } catch {
          // A sound is never worth an error in the room.
        }
      },
      setOutputDevice: setSink,
      dispose: () => {
        audio.pause();
        audio.srcObject = null;
        ownClose();
        void ownContext.close().catch(() => undefined);
      },
    };
  } catch {
    if (element) element.srcObject = null;
    closeLoopback?.();
    void context?.close().catch(() => undefined);
    return null;
  }
}

/**
 * The room's sound output while `enabled`, or a no-op. Made once per room rather than per sound:
 * the loopback takes a moment to connect, and a sound has to land on its moment.
 */
export function useRoomSoundEffects({ enabled, outputDeviceId }: { enabled: boolean; outputDeviceId: string }) {
  const engineRef = React.useRef<RoomSoundEngine | null>(null);
  const outputDeviceIdRef = React.useRef(outputDeviceId);
  outputDeviceIdRef.current = outputDeviceId;

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void createRoomSoundEngine().then(engine => {
      if (cancelled) return engine?.dispose();
      // Read once the loopback is up, so a speaker picked while it connected is not missed.
      engine?.setOutputDevice(outputDeviceIdRef.current);
      engineRef.current = engine;
    });
    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [enabled]);

  React.useEffect(() => {
    engineRef.current?.setOutputDevice(outputDeviceId);
  }, [outputDeviceId]);

  return React.useCallback((sound: RoomSound) => {
    engineRef.current?.play(sound);
  }, []);
}

// ---------------------------------------------------------------------------------------------
// The debater's choice, kept across debates.
// ---------------------------------------------------------------------------------------------

/**
 * Plain `localStorage` behind try/catch rather than a jotai storage atom, for the reason
 * `watched-debates.ts` gives: a module-level atom runs on import and breaks jsdom suites.
 */
export const ROOM_SOUND_EFFECTS_STORAGE_KEY = 'geogenesis.debates.room-sound-effects.v1';

const preferenceListeners = new Set<() => void>();

export function readRoomSoundEffectsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(ROOM_SOUND_EFFECTS_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setRoomSoundEffectsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ROOM_SOUND_EFFECTS_STORAGE_KEY, enabled ? 'on' : 'off');
    memoryPreference = null;
  } catch {
    // Private mode or quota: the choice holds for this page, through the listeners below.
    memoryPreference = enabled;
  }
  for (const listener of preferenceListeners) listener();
}

let memoryPreference: boolean | null = null;

function preferenceSnapshot() {
  return memoryPreference ?? readRoomSoundEffectsEnabled();
}

function subscribeToPreference(onChange: () => void) {
  preferenceListeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ROOM_SOUND_EFFECTS_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    preferenceListeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** On unless the debater turned them off, in this browser, in any debate. */
export function useRoomSoundEffectsEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = React.useSyncExternalStore(subscribeToPreference, preferenceSnapshot, () => true);
  return [enabled, setRoomSoundEffectsEnabled];
}
