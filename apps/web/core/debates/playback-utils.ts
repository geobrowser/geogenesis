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
 * Slot 1 is the clock, always, in the foreground. The pair is kept in lockstep, so its position
 * plus its recording offset is the debate's position, and every seek is expressed that way. Slot 2
 * is *not* interchangeable with it: it is deliberately allowed to run ahead — the drift nudge puts
 * it there on purpose, and a stalled slot 1 can leave it far ahead (GEO-2828) — so treating its
 * clock as the debate's would skip whatever it had got through but the viewer had not heard.
 *
 * `trustSecondary` is what turns that off, and it means one specific thing: the pair was stopped
 * by the browser rather than by us, which happens when the tab is off screen (GEO-2947). There,
 * slot 1's clock is not canonical at all — it is frozen at whatever instant the browser stopped
 * the element it considered silent, while slot 2 carried the debate on — so the position has to
 * be recovered from whatever evidence there is:
 *
 *  - whichever element is still running, slot 1 first;
 *  - then the furthest frozen clock, since a browser does not stop both at the same instant;
 *  - and `lastRunningSeconds`, the caller's own record, which covers the case where an element
 *    stopped between the throttled `timeupdate` ticks of a background tab.
 *
 * Slot 2's frozen clock counts only once its `currentTime` shows the recording has played: one
 * that starts after the debate window has a positive offset, so an untouched slot 2 would
 * otherwise report being that far into the debate before a frame of it had been shown.
 *
 * The caller must reset its record on a deliberate seek and when the recordings change, or a
 * scrub backwards would be dragged forward by it — `useDebatePlayback` does both.
 *
 * `live` says whether the answer came off a running element, so a caller can keep its record
 * current without re-deriving "is either element running" for itself.
 */
export function pairPlayhead(
  primary: ClockVideo | null,
  secondary: ClockVideo | null,
  offsets: { slot1: number; slot2: number },
  lastRunningSeconds: number | null = null,
  trustSecondary = false
): PairPlayhead {
  const primarySeconds = (primary?.currentTime ?? 0) + offsets.slot1;
  const primaryRunning = Boolean(primary && !primary.paused);

  if (!trustSecondary) {
    // Slot 1 is the clock and a running slot 1 is the whole answer: the record is only there to
    // raise a *frozen* one. Anything else would drag a scrub backwards forward again.
    if (primaryRunning) return { seconds: primarySeconds, live: true };
    return {
      seconds: lastRunningSeconds === null ? primarySeconds : Math.max(primarySeconds, lastRunningSeconds),
      live: false,
    };
  }

  // Off screen no clock is authoritative, *including a running one*. A browser that stopped slot 1
  // at debate-time 100 while slot 2 ran on to 130 can hand slot 1 back un-paused at its frozen 100
  // — un-suspended, or un-paused-but-stalled, which `paused === false` cannot tell apart and which
  // is slot 1's documented failure mode (GEO-2828). Returning that 100 as "live" would walk the
  // recovered position backwards over half a minute the viewer had already heard, and drag slot 2
  // back with it on the resume. So every piece of evidence is weighed and the furthest wins.
  const candidates = [primarySeconds];
  // Slot 2 counts once its clock shows the recording has played: one that starts after the debate
  // window has a positive offset, so an untouched slot 2 would otherwise report being that far in.
  if (secondary && secondary.currentTime > 0) candidates.push(secondary.currentTime + offsets.slot2);
  if (lastRunningSeconds !== null) candidates.push(lastRunningSeconds);

  return {
    seconds: Math.max(...candidates),
    live: primaryRunning || Boolean(secondary && !secondary.paused),
  };
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

export type PlayBothOutcome = 'playing' | 'playing-muted' | 'blocked' | 'cancelled';

export type PlayBothOptions = {
  /** Injectable so tests do not wait on real timers. */
  wait?: (ms: number) => Promise<void>;
  /**
   * Has something else taken ownership of these elements since the attempt began?
   *
   * This function confirms a start by polling, so it is *asleep* for most of its runtime, and a
   * pause or a scroll-away lands there routinely. A caller that only checks ownership once this
   * returns is too late: the retry below would have called `play()` on both elements in the
   * meantime, leaving a pair the viewer had paused running in the DOM under a UI showing paused
   * (GEO-2947). Checked before the retry, which is the only point where this function restarts
   * something it did not start.
   */
  isCancelled?: () => boolean;
};

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
 * scroll while the recordings played fine.
 *
 * **But a rejected `play()` does need a special case, and assuming otherwise is GEO-2978.** This
 * comment used to end "a rejection leaves the element paused, so it fails the same check". It does
 * not, or not in time: `play()` sets `paused` to false *synchronously* and only then rejects, and
 * the user agent pauses it again afterwards. So the first confirm poll can see both elements
 * un-paused and report success for a play the browser was in the middle of refusing.
 *
 * Measured on an iPhone in Low Power Mode, which refuses every autoplay: the card reported
 * `playing=true` with both elements `PAUSED` at `t=0.0` and `calls=[play REJECTED:NotAllowedError]`.
 * From there nothing recovers — the autoplay effect will not retry a card it believes is playing,
 * no refusal is recorded, and the paused glyph never renders. The viewer's first tap only pauses
 * what the app imagined was running, which is why it took two taps to start a video.
 *
 * So a refusal now invalidates the reading: whatever `paused` said mid-flight, the browser has
 * told us plainly that it did not start.
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

/**
 * Whether a rejected `play()` was the browser declining, rather than us
 * interrupting.
 *
 * Real engines name it; the message is checked too because a rejection that
 * crosses a boundary can arrive as a plain `Error` carrying the same sentence.
 */
function isRefusal(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false;

  return reason.name === 'NotAllowedError' || /notallowed|does not allow|user agent/i.test(reason.message);
}

export async function playBothWithMutedFallback(
  primary: PlayableVideo,
  secondary: PlayableVideo,
  { wait = defaultWait, isCancelled }: PlayBothOptions = {}
): Promise<PlayBothOutcome> {
  /**
   * Whether the browser said no, as opposed to simply not having started yet.
   *
   * `play()` rejects for two quite different reasons and they need telling
   * apart: `NotAllowedError` is a policy answer — no gesture, or iOS in Low
   * Power Mode — while an `AbortError` is our own `pause()` interrupting the
   * attempt. Only the first is a fact about the device.
   */
  const attempt = async (): Promise<{ running: boolean; refused: boolean }> => {
    const settled = await Promise.allSettled([primary.play(), secondary.play()]);
    const refused = settled.some(result => result.status === 'rejected' && isRefusal(result.reason));

    return { running: await bothRunning(primary, secondary, wait), refused };
  };

  const first = await attempt();

  if (first.running && !first.refused) return 'playing';

  /*
   * A refusal outranks the cancellation check below, and that ordering is the
   * whole fix for GEO-2978.
   *
   * `resumeBoth` bumps its generation on entry, and its caller re-enters while
   * `playing` is false — so by the time this returns, `isCancelled` is routinely
   * true simply because the *next* attempt has started. Reporting 'cancelled'
   * there threw away the browser's answer, the next attempt threw away its own,
   * and the card never learned it had been refused: no play control, no error,
   * just a still frame. Measured against the preview with `play()` forced to
   * reject — zero play controls on six cards.
   *
   * Only when there is nothing left to try. With audio still on, the muted retry
   * below is the thing that usually turns a refusal into playback, and skipping
   * it to report early would lose real playback to protect a flag.
   */
  if (first.refused && primary.muted && secondary.muted) return 'blocked';

  // Someone paused these, or scrolled them off screen, while the confirm above was polling. The
  // retry would start them again — and the caller checking ownership after this returns cannot
  // undo a `play()` that has already happened.
  if (isCancelled?.()) return 'cancelled';

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

  const retry = await attempt();

  return retry.running && !retry.refused ? 'playing-muted' : 'blocked';
}
