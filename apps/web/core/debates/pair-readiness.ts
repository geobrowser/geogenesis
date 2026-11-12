'use client';

import * as React from 'react';

/**
 * Hold a debate's two recordings until both can play, then let them go together (GEO-2965).
 *
 * The signed URLs arrive as a pair (`useDebatePlayback` commits them through one `Promise.all`),
 * but from there each `<video>` loads on its own. `resumeBoth` calls `play()` on both at once, and
 * an element with data starts the moment it is asked while its partner is still opening — so one
 * panel paints and runs, with the turn clock, countdown and subtitle already moving, while the
 * other is a grey tile. That is the "one of them loads before the other" Preston reported.
 *
 * So the card waits. It does not start either element until both report `HAVE_FUTURE_DATA` (what
 * `canplay` means), and it keeps both hidden until both have a frame to show. Waiting costs the
 * slower of the two; what bounds that cost is the rest of this file.
 */

/**
 * The longest the pair is held before playing whatever is ready.
 *
 * A backstop, not the expected wait. Measured in production Chrome on 2026-09-30 against the
 * finalized recordings: both elements of a cold card reached `canplay` 300-430ms after their `src`
 * was set, within ~90ms of each other. Three seconds is several times that, so it only fires on a
 * connection slow enough that holding longer would be worse than today's staggered start.
 */
export const PAIR_HOLD_TIMEOUT_MS = 3_000;

/**
 * How long an element must stay `isStopped` before it counts as stopped for good. iOS Safari loads
 * a paused element only to its metadata; Chrome is idle for an instant just before `canplay`.
 */
export const SUSPEND_GRACE_MS = 250;

/** What the hold reads off one element. Deliberately a subset, so tests can pass plain objects. */
export type PairMember = Pick<HTMLMediaElement, 'readyState' | 'networkState' | 'error'> &
  Partial<Pick<HTMLMediaElement, 'seeking'>>;

/**
 * Enough data to play, *where it is going to play from*. `canplay`'s own threshold, and not while a
 * seek is in flight: `useDebatePlayback` moves a fresh pair to its starting position the moment
 * both know their shape, and `readyState` can still report the data at the old position until the
 * seek has begun.
 */
const canPlay = (video: PairMember) => video.readyState >= 3 /* HAVE_FUTURE_DATA */ && !video.seeking;
/** A frame to paint. What revealing the pair needs, which is less than what starting it needs. */
const hasFrame = (video: PairMember) => video.readyState >= 2; /* HAVE_CURRENT_DATA */
/** Idle short of a frame with no seek in flight. iOS reports `NETWORK_IDLE` while a paused seek fetches. */
const isStopped = (video: PairMember) =>
  video.readyState < 2 /* HAVE_CURRENT_DATA */ && !video.seeking && video.networkState === 1; /* NETWORK_IDLE */

/**
 * Whether a held pair may start now.
 *
 * `stoppedLongAgo` says that element has been `isStopped` for `SUSPEND_GRACE_MS` without a break; it
 * is read again *now*, so an element that went on to load is not mistaken for one that stopped.
 */
export function pairMayStart(
  slot1: PairMember,
  slot2: PairMember,
  { stoppedLongAgo = [false, false] }: { stoppedLongAgo?: [boolean, boolean] } = {}
): boolean {
  if (canPlay(slot1) && canPlay(slot2)) return true;
  // A recording that failed is `DebaterVideo`'s to rebuild, and it cannot rebuild what is never
  // played past. Starting falls back to exactly what the card did before the hold existed.
  if (slot1.error || slot2.error) return true;
  // A stopped element only moves once played, but its partner may still be loading (its pre-roll
  // seek, or its metadata, after which that seek comes): start once the partner can play, or has
  // stopped too. A partner stopped short of its metadata (a browser that loads nothing while
  // paused) is stopped for good as well.
  const stopped = [0, 1].map(i => stoppedLongAgo[i] && isStopped([slot1, slot2][i]));
  const settled = (video: PairMember, i: number) => canPlay(video) || stopped[i];
  if (stopped[0] && settled(slot2, 1)) return true;
  if (stopped[1] && settled(slot1, 0)) return true;
  return false;
}

/** Whether both elements have a frame to show, so revealing them paints both at once. */
export function pairMayShow(slot1: PairMember, slot2: PairMember): boolean {
  return hasFrame(slot1) && hasFrame(slot2);
}

/** Everything that can move an element's `readyState` or `networkState`, or report it failed. */
const MEDIA_EVENTS = [
  'loadstart',
  'progress',
  'loadedmetadata',
  'loadeddata',
  'canplay',
  'canplaythrough',
  'seeking',
  'seeked',
  'suspend',
  'error',
  'emptied',
];

type Latch = { key: string; started: boolean; shown: boolean };

export type PairReadiness = {
  /** The pair has been let go: both could play, the wait ran out, or the viewer asked. */
  mayStart: boolean;
  /** The pair may be drawn. False while neither the hold nor both frames have let it be. */
  mayShow: boolean;
  /** The active card is holding right now: URLs in hand, waiting on media. */
  holding: boolean;
  /** Stop holding — the viewer asked for playback themselves, and a tap outranks the wait. */
  release: () => void;
};

/**
 * The hold, for one debate's pair of elements.
 *
 * `pairKey` names the debate. Both answers latch for it: once the pair has started or been shown,
 * a scroll away and back, a seek, or one slot being re-signed (`refreshSlotUrl`) never puts the
 * card back behind the hold. A new `pairKey` — the feed re-ranking a different debate onto this
 * card — starts it over.
 *
 * `active` gates only the *start*. The look-ahead cards load too, and revealing them as a pair
 * matters as much as starting the active one as a pair; but the timeout is about how long a viewer
 * who is looking at the card waits, so it runs only while they are.
 */
export function usePairReadiness({
  pairKey,
  slot1Ref,
  slot2Ref,
  slot1Src,
  slot2Src,
  active,
  timeoutMs = PAIR_HOLD_TIMEOUT_MS,
}: {
  pairKey: string;
  slot1Ref: React.RefObject<HTMLVideoElement | null>;
  slot2Ref: React.RefObject<HTMLVideoElement | null>;
  slot1Src: string | null;
  slot2Src: string | null;
  active: boolean;
  timeoutMs?: number;
}): PairReadiness {
  const [latch, setLatch] = React.useState<Latch>({ key: pairKey, started: false, shown: false });
  // A different debate starts over, in this render rather than an effect's later: the previous
  // debate's latch must not show the new pair, even for one frame.
  const current = latch.key === pairKey ? latch : { key: pairKey, started: false, shown: false };
  if (current !== latch) setLatch(current);

  const hasSources = slot1Src !== null && slot2Src !== null;

  const mark = React.useCallback(
    (next: Partial<Pick<Latch, 'started' | 'shown'>>) =>
      setLatch(previous => {
        if (previous.key !== pairKey) return previous;
        const started = previous.started || next.started === true;
        // Starting reveals too: a pair released by the timeout plays whatever is ready, and a tile
        // held invisible while its partner plays would be the asymmetry this exists to remove,
        // drawn the other way round.
        const shown = previous.shown || started || next.shown === true;
        return started === previous.started && shown === previous.shown ? previous : { ...previous, started, shown };
      }),
    [pairKey]
  );

  const settled = current.started && current.shown;

  React.useEffect(() => {
    if (!hasSources || settled) return;
    const slot1 = slot1Ref.current;
    const slot2 = slot2Ref.current;
    if (!slot1 || !slot2) return;

    const pair = [slot1, slot2] as const;
    // Per element: the grace timer running while it is stopped, and whether one has run out.
    const graceTimers: [ReturnType<typeof setTimeout> | null, ReturnType<typeof setTimeout> | null] = [null, null];
    const stoppedLongAgo: [boolean, boolean] = [false, false];
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const evaluate = () => {
      for (const index of [0, 1] as const) {
        if (isStopped(pair[index])) {
          if (graceTimers[index] !== null || stoppedLongAgo[index]) continue;
          const timer = setTimeout(() => {
            timers.delete(timer);
            graceTimers[index] = null;
            stoppedLongAgo[index] = true;
            evaluate();
          }, SUSPEND_GRACE_MS);
          graceTimers[index] = timer;
          timers.add(timer);
        } else {
          // Any break starts the grace over: it measures one unbroken stop.
          stoppedLongAgo[index] = false;
          const timer = graceTimers[index];
          if (timer !== null) {
            clearTimeout(timer);
            timers.delete(timer);
            graceTimers[index] = null;
          }
        }
      }
      mark({
        shown: pairMayShow(slot1, slot2),
        started: active && pairMayStart(slot1, slot2, { stoppedLongAgo }),
      });
    };

    const listeners = pair.map(video => {
      for (const type of MEDIA_EVENTS) video.addEventListener(type, evaluate);
      return () => {
        for (const type of MEDIA_EVENTS) video.removeEventListener(type, evaluate);
      };
    });

    // Both may already be there — the look-ahead preload is the usual way a card arrives — in
    // which case no event is coming and this is the whole wait. An element that went idle before
    // this run began listening (a look-ahead card's, on a browser that ignores `preload`) starts
    // its grace here, since no second `suspend` is coming for it.
    evaluate();

    if (active) {
      const timer = setTimeout(() => mark({ started: true }), timeoutMs);
      timers.add(timer);
    }

    return () => {
      for (const remove of listeners) remove();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [active, hasSources, mark, settled, slot1Ref, slot1Src, slot2Ref, slot2Src, timeoutMs]);

  const release = React.useCallback(() => mark({ started: true }), [mark]);

  return {
    mayStart: current.started,
    mayShow: current.shown,
    holding: active && hasSources && !current.started,
    release,
  };
}

/**
 * How much a held pair must have buffered past where it stands before it plays again (GEO-3603).
 *
 * A break's cut jumps several seconds into what was buffered, so a pair that can play there may
 * have only a second or two left. Measured on Stream at 4 Mbps: 2.2 s of runway after the cut, the
 * next segment 3 s away, and slot 1 starved mid-sentence. Waiting for this much under the held title
 * absorbs that, and on a fast connection the buffer already runs far past it.
 */
export const HELD_PAIR_RUNWAY_SECONDS = 3;

/**
 * How close to the end a buffer counts as reaching it. Wider than `PLAYBACK_END_EPSILON_SECONDS`: a
 * buffer ends on a segment boundary, which can fall a little short of `duration`.
 */
const RUNWAY_END_SLACK_SECONDS = 0.25;

/** A held element: `PairMember`, plus what its runway is read from. */
export type HeldPairMember = PairMember & Partial<Pick<HTMLMediaElement, 'buffered' | 'currentTime' | 'duration'>>;

/** Enough buffered ahead to play on, or buffered to the end of the recording. */
function hasRunway(video: HeldPairMember) {
  if (!video.buffered || video.currentTime === undefined) return true;
  const ahead = bufferedAheadSeconds(video, video.currentTime);
  if (ahead >= HELD_PAIR_RUNWAY_SECONDS) return true;
  return (
    video.duration !== undefined &&
    Number.isFinite(video.duration) &&
    video.currentTime + ahead >= video.duration - RUNWAY_END_SLACK_SECONDS
  );
}

/**
 * Whether a pair the player paused itself may play again (GEO-3603): under a break's captured
 * frames, or while a follower that fell far behind is brought back into step.
 *
 * The rule the first start uses (`pairMayStart`), plus a runway (`HELD_PAIR_RUNWAY_SECONDS`), not
 * "both have a frame": a pair let go at its first presentable frame has nothing after it on a slow
 * connection, so one element starves a moment later while the other runs on, and the drift that
 * opens up turns into the next freeze. Past `PAIR_HOLD_TIMEOUT_MS` the pair plays whatever is
 * ready, so a browser that never reports more (one that holds back buffering a paused element)
 * cannot freeze playback for good.
 */
export function heldPairMayResume(slot1: HeldPairMember, slot2: HeldPairMember, heldForMs: number): boolean {
  if (heldForMs >= PAIR_HOLD_TIMEOUT_MS || slot1.error || slot2.error) return true;
  return pairMayStart(slot1, slot2) && hasRunway(slot1) && hasRunway(slot2);
}

/**
 * `heldPairMayResume` for one hold, on a clock that starts now. Every hold the player takes (a
 * break's cut, a held resync) asks through this, so the backstop has one owner.
 */
export function heldPairGate(slot1: HeldPairMember, slot2: HeldPairMember): () => boolean {
  const heldAt = Date.now();
  return () => heldPairMayResume(slot1, slot2, Date.now() - heldAt);
}

/** How many seconds `video` holds from `seconds` onward; 0 when `seconds` is not buffered. */
export function bufferedAheadSeconds(video: Partial<Pick<HTMLMediaElement, 'buffered'>>, seconds: number): number {
  const ranges = video.buffered;
  if (!ranges) return 0;
  for (let index = 0; index < ranges.length; index++) {
    if (seconds >= ranges.start(index) && seconds <= ranges.end(index)) return ranges.end(index) - seconds;
  }
  return 0;
}
