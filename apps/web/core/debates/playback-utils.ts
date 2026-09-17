import type { Debate, DebateMediaResponse, DebateMediaTurnSegment, DebateParticipant, ParticipantSlot } from './api';

export type TurnState = {
  slot: ParticipantSlot;
  progress: number;
  seconds: number;
} | null;

/**
 * Has both per-slot recordings. A debate whose media job failed still passes this, so the feed
 * pairs it with {@link hasProcessedVideo} before rendering.
 */
export function isWatchableDebate(debate: Debate) {
  return (
    debate.status === 'complete' &&
    debate.recordings.some(recording => recording.participant_slot === 1) &&
    debate.recordings.some(recording => recording.participant_slot === 2)
  );
}

/** The media worker composed the two per-slot recordings into a single `final_video`. */
export function hasProcessedVideo(media: DebateMediaResponse | undefined): boolean {
  return media?.artifacts.some(artifact => artifact.kind === 'final_video') ?? false;
}

export function hasSocialVideo(media: DebateMediaResponse | undefined): boolean {
  return media?.artifacts.some(artifact => artifact.kind === 'social_video') ?? false;
}

export function normalizeTurnDurationsMs(values: number[]) {
  const normalized = values.filter(value => Number.isFinite(value) && value > 0);
  return normalized.length > 0 ? normalized : [30_000, 30_000];
}

export function timelineSecondsFor(turnDurationsMs: number[]) {
  return turnDurationsMs.reduce((sum, value) => sum + value / 1_000, 0);
}

export function turnStateForTime(firstSlot: ParticipantSlot, turnDurationsMs: number[], seconds: number): TurnState {
  let elapsedBoundary = 0;
  for (let index = 0; index < turnDurationsMs.length; index += 1) {
    const segmentSeconds = turnDurationsMs[index] / 1_000;
    const nextBoundary = elapsedBoundary + segmentSeconds;
    if (seconds < nextBoundary || index === turnDurationsMs.length - 1) {
      const elapsedInSegment = Math.max(0, seconds - elapsedBoundary);
      return {
        slot: turnSlot(firstSlot, index),
        progress: Math.max(0, Math.min(1, elapsedInSegment / Math.max(1, segmentSeconds))),
        seconds: Math.max(0, nextBoundary - seconds),
      };
    }
    elapsedBoundary = nextBoundary;
  }
  return null;
}

function turnSlot(firstSlot: ParticipantSlot, index: number): ParticipantSlot {
  return index % 2 === 0 ? firstSlot : firstSlot === 1 ? 2 : 1;
}

/**
 * The turn boundaries the render actually used, when the media response has them (GEO-2949).
 *
 * `turnStateForTime` walks `turn_durations_ms`, which is the format's *allowance*. Debaters end
 * turns early, so the allowance is not what got cut: on the debate this was measured against, the
 * page switched 4.0-10.8s late on every turn and 11.95s of speech played with the wrong panel
 * unmuted — the audio dropping out mid-sentence and cutting back in. `turn_segments` carries the
 * boundaries the video was built from, so it is what the audible panel and the subtitles have to
 * follow.
 *
 * Sorted defensively: the caller receives the array straight off the wire, and a binary search
 * over an unsorted list would silently pick the wrong speaker.
 */
export function sortTurnSegments(segments: DebateMediaTurnSegment[]): DebateMediaTurnSegment[] {
  return [...segments]
    .filter(segment => Number.isFinite(segment.output_start_ms) && segment.output_end_ms > segment.output_start_ms)
    .sort((a, b) => a.output_start_ms - b.output_start_ms);
}

export function timelineSecondsForSegments(segments: DebateMediaTurnSegment[]): number {
  return segments.reduce((longest, segment) => Math.max(longest, segment.output_end_ms / 1_000), 0);
}

/**
 * `turnStateForTime`'s answer, derived from the rendered segments instead of the allowance.
 *
 * `progress` runs off `countdown_start_ms` rather than the segment start, so a 60s turn still
 * renders a 60s ring even though its retained video is 65s long — before the clock starts, the
 * ring sits at 0 while the speaker is already talking. That is what the debaters saw.
 */
export function turnStateFromSegments(segments: DebateMediaTurnSegment[], seconds: number): TurnState {
  if (segments.length === 0) return null;

  const ms = seconds * 1_000;
  const active =
    segments.find(segment => ms >= segment.output_start_ms && ms < segment.output_end_ms) ??
    // Past the end, hold the final turn rather than blanking the speaker — the playhead sits on
    // `output_end_ms` for the whole paused tail after playback finishes.
    (ms >= segments[segments.length - 1].output_end_ms ? segments[segments.length - 1] : null);
  if (!active) return null;

  const countdownStartMs = Math.min(
    Math.max(active.countdown_start_ms ?? active.output_start_ms, active.output_start_ms),
    active.output_end_ms
  );
  const clockMs = Math.max(1, active.output_end_ms - countdownStartMs);

  return {
    slot: active.participant_slot,
    progress: Math.max(0, Math.min(1, (ms - countdownStartMs) / clockMs)),
    seconds: Math.max(0, (active.output_end_ms - ms) / 1_000),
  };
}

export function clampSeconds(value: number, duration: number) {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, safeDuration));
}

/**
 * Each debater records their own webcam on their own device, so the two files don't begin
 * at the same instant. The backend composites the final video by anchoring every recording
 * to the server-authoritative debate start (`debates.started_at`): a recording that began
 * N ms after that start is padded by N ms up front. Replicate that here so the two feed
 * videos stay aligned — at debate-timeline position P, slot s plays at `P - offset[s]`
 * seconds. Without it the later-starting recording runs ahead and the debaters end up
 * talking over each other by the second turn.
 */
export function recordingWindowOffsetsSeconds(
  debateStartedAt: string | null,
  slot1StartedAtMs: number | null,
  slot2StartedAtMs: number | null
): { slot1: number; slot2: number } {
  const parsedStart = debateStartedAt ? Date.parse(debateStartedAt) : NaN;
  const windowStartMs = Number.isFinite(parsedStart)
    ? parsedStart
    : Math.min(slot1StartedAtMs ?? Number.POSITIVE_INFINITY, slot2StartedAtMs ?? Number.POSITIVE_INFINITY);
  return {
    slot1: offsetSeconds(slot1StartedAtMs, windowStartMs),
    slot2: offsetSeconds(slot2StartedAtMs, windowStartMs),
  };
}

function offsetSeconds(startedAtMs: number | null, windowStartMs: number): number {
  if (startedAtMs === null || !Number.isFinite(startedAtMs) || !Number.isFinite(windowStartMs)) return 0;
  return (startedAtMs - windowStartMs) / 1_000;
}

export function participantForSlot(debate: Debate, slot: ParticipantSlot) {
  return debate.participants.find(participant => participant.participant_slot === slot) ?? null;
}

export function orderedParticipants(debate: Debate) {
  return [...debate.participants].sort((a, b) => a.participant_slot - b.participant_slot);
}

export function speakerLabel(participant: Pick<DebateParticipant, 'display_name' | 'profile_space_id'>) {
  return participant.display_name || participant.profile_space_id;
}

/** The two elements this helper needs, so tests do not have to build a whole `HTMLVideoElement`. */
export type PlayableVideo = Pick<HTMLVideoElement, 'muted' | 'paused'> & { play: () => Promise<void> };

export type PlayBothOutcome = 'playing' | 'playing-muted' | 'blocked';

/**
 * Start both recordings, falling back to muted when the browser blocks unmuted autoplay
 * (GEO-2783).
 *
 * `play()` is rejected — or resolves while leaving the element paused — when it is not driven by a
 * user gesture and the video has audio. The debate feed calls this from an effect as a debate
 * scrolls into view, and the viewer's mute preference is a session-wide atom, so once anything has
 * been unmuted every later autoplay is blocked and the viewer sees "Could not play both videos"
 * for doing nothing.
 *
 * A blocked unmuted play is a request the browser will honour muted, so it is asked again muted
 * before giving up. `'playing-muted'` is reported rather than folded into `'playing'` because the
 * caller has to record that audio is now off — otherwise the UI offers a "mute" control on a
 * silent video and the next autoplay fails identically.
 *
 * Success is judged by whether both elements are actually running shortly afterwards, not by
 * whether `play()` resolved. `play()` can resolve while the element is still transitioning out of
 * `paused`, so checking `paused` on the very next microtask reports a block on a video that plays
 * a moment later — which is why the feed showed "Could not play both videos" on essentially every
 * scroll while the recordings played fine. A rejected `play()` needs no special case: a rejection
 * leaves the element paused, so it fails the same check.
 *
 * The grace window is deliberately short. It only has to outlast the paused -> playing transition,
 * and every millisecond of it delays the muted retry on a genuine block.
 */
const PLAY_CONFIRM_POLLS = 4;
const PLAY_CONFIRM_INTERVAL_MS = 75;

const defaultWait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function bothRunning(
  primary: PlayableVideo,
  secondary: PlayableVideo,
  wait: (ms: number) => Promise<void>
): Promise<boolean> {
  for (let poll = 0; poll < PLAY_CONFIRM_POLLS; poll++) {
    if (!primary.paused && !secondary.paused) return true;
    await wait(PLAY_CONFIRM_INTERVAL_MS);
  }
  return !primary.paused && !secondary.paused;
}

export async function playBothWithMutedFallback(
  primary: PlayableVideo,
  secondary: PlayableVideo,
  /** Injectable so tests do not wait on real timers. */
  wait: (ms: number) => Promise<void> = defaultWait
): Promise<PlayBothOutcome> {
  const attempt = async () => {
    await Promise.allSettled([primary.play(), secondary.play()]);
    return bothRunning(primary, secondary, wait);
  };

  if (await attempt()) return 'playing';

  // Nothing to retry if audio was already off — the block is not the autoplay policy.
  if (primary.muted && secondary.muted) return 'blocked';

  primary.muted = true;
  secondary.muted = true;
  return (await attempt()) ? 'playing-muted' : 'blocked';
}
