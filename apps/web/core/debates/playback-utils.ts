import type { Debate, DebateMediaResponse, DebateParticipant, ParticipantSlot } from './api';

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

/** What `pairPlayhead` needs off an element, so tests need not build a whole video. */
export type ClockVideo = Pick<HTMLVideoElement, 'paused' | 'currentTime'>;

export type PairPlayhead = {
  /** Debate-timeline seconds. */
  seconds: number;
  /** Read off an element that is actually running, rather than reconstructed from a paused one. */
  live: boolean;
};

/**
 * Where the debate is, in debate-timeline seconds, given the two recordings' own clocks.
 *
 * Slot 1 is the clock. The pair is kept in lockstep, so its position plus its recording offset
 * is the debate's position, and every seek is expressed that way.
 *
 * The exception is a pair that has been split without anyone deciding to — a browser stopping
 * the element it considers silent once the tab is off screen (GEO-2947). If slot 1 is the one
 * that got stopped, its clock is frozen at wherever it stopped while slot 2 carries on, and
 * reading the debate off it is wrong twice over: the turn never advances, so audio never moves
 * to the next speaker, and the resume on return seeks the pair back to the frozen position,
 * replaying everything the viewer heard in the background.
 *
 * So: whichever element is actually running is the clock, slot 1 first.
 *
 * With neither running there is no clock left to read, and the frozen one can be arbitrarily
 * stale — slot 1 stops, slot 2 plays on for a minute, then slot 2 stops too (or reaches `ended`,
 * which also reads as paused). That is what `lastRunningSeconds` is for: the caller's memory of
 * where the debate had actually got to, which wins over a frozen clock behind it. Callers must
 * reset that memory on a deliberate seek and when the recordings change, or a scrub backwards
 * would be dragged forward by it — `useDebatePlayback` does both.
 *
 * The memory alone is not enough either. It is refreshed on ticks, and `timeupdate` is throttled
 * in a background tab — so an element that stops between ticks stops somewhere the memory never
 * saw, and its own `pause` event arrives too late to help (it already reads as paused). Both
 * frozen clocks are therefore weighed alongside it, and the furthest wins.
 *
 * Slot 2's is weighed only once its `currentTime` shows the recording has actually played.
 * A recording that starts after the debate window has a positive offset, so an untouched slot 2
 * would otherwise read as being that far into the debate before a frame of it has been shown.
 *
 * `live` says whether the answer came off a running element, so a caller can keep its memory
 * current without re-deriving "is either element running" for itself.
 */
export function pairPlayhead(
  primary: ClockVideo | null,
  secondary: ClockVideo | null,
  offsets: { slot1: number; slot2: number },
  lastRunningSeconds: number | null = null
): PairPlayhead {
  if (primary && !primary.paused) return { seconds: primary.currentTime + offsets.slot1, live: true };
  if (secondary && !secondary.paused) return { seconds: secondary.currentTime + offsets.slot2, live: true };
  const candidates = [(primary?.currentTime ?? 0) + offsets.slot1];
  if (secondary && secondary.currentTime > 0) candidates.push(secondary.currentTime + offsets.slot2);
  if (lastRunningSeconds !== null) candidates.push(lastRunningSeconds);
  return { seconds: Math.max(...candidates), live: false };
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

  // Both outcomes below leave the elements muted, and deliberately so: this function does not
  // know what the caller renders `muted` from, and it has been awaiting for up to ~300ms, so any
  // value it captured on the way in may already be out of date — the viewer can mute from the
  // control that stays visible during playback, or from another card sharing the preference.
  // Writing a stale snapshot back is worse than leaving the mute: React only writes a DOM
  // property when its own previous value differs, so a write it disagrees with is one it will
  // never repair, and the pair would play audibly under a UI showing muted (GEO-2947).
  //
  // 'playing-muted' is paired by the caller with the state change that makes the mute the
  // rendered truth. 'blocked' is repaired by whoever renders `muted`, once the attempt is over —
  // `DebateFeedPlayer` re-asserts it when `isResuming` falls.
  primary.muted = true;
  secondary.muted = true;
  return (await attempt()) ? 'playing-muted' : 'blocked';
}
