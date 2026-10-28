/**
 * Whether the debate room actually plays what it receives (GEO-3511). The call stats say whether the
 * opponent's audio and video arrived; these say whether they reached a speaker and the screen. Pure,
 * so every rule is testable from plain objects.
 */

/** The opponent's audio as this person's browser handles it, worst explanation first. */
export type RecvAudioState =
  | 'no_track'
  /** The browser's autoplay policy refused to play it until the person clicks. */
  | 'blocked'
  | 'detached'
  | 'paused'
  /** Our element is muted: the room's speaker toggle. */
  | 'muted'
  /** The opponent muted their microphone. */
  | 'remote_muted'
  | 'playing';

/** The opponent's camera as shown here, worst explanation first. */
export type RecvVideoState =
  | 'no_track'
  /** The opponent turned their camera off. */
  | 'remote_muted'
  | 'detached'
  /** Attached to an element that is not in the page. */
  | 'not_mounted'
  /** In the page with no size: a hidden or collapsed tile. */
  | 'hidden'
  | 'paused'
  /** Showing an element with no decoded picture yet. */
  | 'no_frames'
  /** A picture on screen that stopped updating: nothing decoded since the last sample. */
  | 'frozen'
  | 'shown';

/** Where the opponent's audio is routed. `missing`: the chosen speaker is no longer connected. */
export type AudioOutputState = 'default' | 'selected' | 'mismatch' | 'missing';

export type MediaElementLike = {
  paused: boolean;
  muted: boolean;
  isConnected: boolean;
  sinkId?: string;
  videoWidth?: number;
  clientWidth?: number;
  clientHeight?: number;
};

export type RemoteMediaLike = {
  /** The publication's mute: the sender switched it off. */
  muted: boolean;
  elements: readonly MediaElementLike[];
};

export function recvAudioState(audio: RemoteMediaLike | null, canPlaybackAudio: boolean): RecvAudioState {
  if (!audio) return 'no_track';
  if (!canPlaybackAudio) return 'blocked';
  if (audio.elements.length === 0) return 'detached';
  // An audio element plays whether or not it is in the page, so only its own state counts.
  const live = audio.elements.filter(element => !element.paused);
  if (live.length === 0) return 'paused';
  if (live.every(element => element.muted)) return 'muted';
  return audio.muted ? 'remote_muted' : 'playing';
}

/** @param fps frames decoded per second over the last sample, when measured. */
export function recvVideoState(video: RemoteMediaLike | null, fps: number | null = null): RecvVideoState {
  if (!video) return 'no_track';
  if (video.muted) return 'remote_muted';
  if (video.elements.length === 0) return 'detached';
  const mounted = video.elements.filter(element => element.isConnected);
  if (mounted.length === 0) return 'not_mounted';
  const sized = mounted.filter(element => (element.clientWidth ?? 0) > 0 && (element.clientHeight ?? 0) > 0);
  if (sized.length === 0) return 'hidden';
  const playing = sized.filter(element => !element.paused);
  if (playing.length === 0) return 'paused';
  if (!playing.some(element => (element.videoWidth ?? 0) > 0)) return 'no_frames';
  return fps === 0 ? 'frozen' : 'shown';
}

const isDefaultOutput = (id: string | null | undefined) => !id || id === 'default';

/**
 * Whether the opponent's audio goes where the person chose. `available` is the speakers the browser
 * lists, when known: a chosen speaker that is gone is `missing` whatever the elements say.
 */
export function audioOutputState(
  selectedId: string | null,
  audio: RemoteMediaLike | null,
  available?: readonly string[]
): AudioOutputState | null {
  if (isDefaultOutput(selectedId)) return 'default';
  if (available && !available.includes(selectedId!)) return 'missing';
  const sinks = audio?.elements.flatMap(element => (element.sinkId === undefined ? [] : [element.sinkId])) ?? [];
  if (sinks.length === 0) return null;
  return sinks.every(sink => sink === selectedId) ? 'selected' : 'mismatch';
}

/** Cumulative counters for the opponent's camera as received. */
export type VideoReceiverSnapshot = {
  streamId?: string;
  framesDecoded?: number;
  /** Milliseconds, the report's own clock. */
  timestamp?: number;
  /** The received layer's height: a simulcast low layer reads as 180 or so. */
  frameHeight?: number;
};

type StatsEntry = { type?: string; kind?: string; [field: string]: unknown };

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

export function readVideoReceiverReport(entries: readonly StatsEntry[]): VideoReceiverSnapshot {
  const inbound = entries.find(entry => entry.type === 'inbound-rtp' && entry.kind === 'video');
  if (!inbound) return {};
  return {
    streamId: inbound.ssrc === undefined ? undefined : String(inbound.ssrc),
    framesDecoded: num(inbound.framesDecoded),
    timestamp: num(inbound.timestamp),
    frameHeight: num(inbound.frameHeight),
  };
}

/** Decoded frames per second since the previous reading of the same stream. */
export function recvVideoFps(current: VideoReceiverSnapshot, previous: VideoReceiverSnapshot | undefined) {
  if (current.framesDecoded === undefined || current.timestamp === undefined) return null;
  if (!previous || previous.streamId !== current.streamId) return null;
  if (previous.framesDecoded === undefined || previous.timestamp === undefined) return null;
  const seconds = (current.timestamp - previous.timestamp) / 1_000;
  if (seconds <= 0) return null;
  return Math.round(Math.max(0, current.framesDecoded - previous.framesDecoded) / seconds);
}
