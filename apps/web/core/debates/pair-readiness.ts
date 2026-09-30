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
 * How long after a `suspend` an element that still cannot play is taken to have stopped for good.
 *
 * `suspend` means the browser has stopped fetching. Chrome fires it a millisecond *before*
 * `canplay` on these files, so on its own it proves nothing; it is re-checked after this grace. An
 * element that is still short of `HAVE_FUTURE_DATA` and still idle by then is one the browser will
 * not load further until it is played — iOS Safari ignores `preload`, and data-saver modes do the
 * same — and holding it would only run out the timeout for nothing.
 */
export const SUSPEND_GRACE_MS = 250;

/** What the hold reads off one element. Deliberately a subset, so tests can pass plain objects. */
export type PairMember = Pick<HTMLMediaElement, 'readyState' | 'networkState' | 'error'>;

/** Enough data to play. `canplay`'s own threshold. */
const canPlay = (video: PairMember) => video.readyState >= 3; /* HAVE_FUTURE_DATA */
/** A frame to paint. What revealing the pair needs, which is less than what starting it needs. */
const hasFrame = (video: PairMember) => video.readyState >= 2; /* HAVE_CURRENT_DATA */
/** Has stopped fetching without being able to play. See `SUSPEND_GRACE_MS`. */
const isStuck = (video: PairMember) => !canPlay(video) && video.networkState === 1; /* NETWORK_IDLE */

/**
 * Whether a held pair may start now.
 *
 * `suspendedLongAgo` says a `suspend` has been seen on that element at least `SUSPEND_GRACE_MS`
 * ago; `isStuck` is then read off its state *now*, so an element that went on to load is not
 * mistaken for one that stopped.
 */
export function pairMayStart(
  slot1: PairMember,
  slot2: PairMember,
  { suspendedLongAgo = [false, false] }: { suspendedLongAgo?: [boolean, boolean] } = {}
): boolean {
  if (canPlay(slot1) && canPlay(slot2)) return true;
  // A recording that failed is `DebaterVideo`'s to rebuild, and it cannot rebuild what is never
  // played past. Starting falls back to exactly what the card did before the hold existed.
  if (slot1.error || slot2.error) return true;
  if (suspendedLongAgo[0] && isStuck(slot1)) return true;
  if (suspendedLongAgo[1] && isStuck(slot2)) return true;
  return false;
}

/** Whether both elements have a frame to show, so revealing them paints both at once. */
export function pairMayShow(slot1: PairMember, slot2: PairMember): boolean {
  return hasFrame(slot1) && hasFrame(slot2);
}

/** Everything that can move an element's `readyState` or `networkState`, or report it failed. */
const MEDIA_EVENTS = ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'suspend', 'error', 'emptied'];

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

    // Per element: whether a `suspend` was seen, and whether its grace has since run out.
    const suspended: [boolean, boolean] = [false, false];
    const suspendedLongAgo: [boolean, boolean] = [false, false];
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const evaluate = () => {
      mark({
        shown: pairMayShow(slot1, slot2),
        started: active && pairMayStart(slot1, slot2, { suspendedLongAgo }),
      });
    };

    const noteSuspended = (index: 0 | 1) => {
      if (suspended[index]) return;
      suspended[index] = true;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!suspended[index]) return;
        suspendedLongAgo[index] = true;
        evaluate();
      }, SUSPEND_GRACE_MS);
      timers.add(timer);
    };

    const listeners = ([slot1, slot2] as const).map((video, i) => {
      const index = i as 0 | 1;
      const onEvent = (event: Event) => {
        if (event.type === 'suspend') noteSuspended(index);
        // A reload (`emptied`) is a fresh start for that element, and its earlier suspend is
        // evidence about a fetch that no longer exists.
        if (event.type === 'emptied') {
          suspended[index] = false;
          suspendedLongAgo[index] = false;
        }
        evaluate();
      };
      for (const type of MEDIA_EVENTS) video.addEventListener(type, onEvent);
      return () => {
        for (const type of MEDIA_EVENTS) video.removeEventListener(type, onEvent);
      };
    });

    // An element can have gone idle before this run began listening — a look-ahead card whose
    // `suspend` fired while it was not yet the active one, which is every card on a browser that
    // ignores `preload`. No second `suspend` is coming for it, so it is treated as one seen now.
    // The grace still applies: a card just raised to `preload="auto"` resumes fetching within it
    // on a browser that honours the raise, and is then no longer idle when it is checked.
    if (isStuck(slot1)) noteSuspended(0);
    if (isStuck(slot2)) noteSuspended(1);

    // Both may already be there — the look-ahead preload is the usual way a card arrives — in
    // which case no event is coming and this is the whole wait.
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
