import { type TimedClaim, isAssertableMoment } from './claim-timing';
import { PLAYBACK_END_EPSILON_MS } from './playback-utils';

/**
 * How long a claim card stays up once the debater has finished saying it.
 *
 * This is now the card's whole life, not a tail added to it — see {@link tickerWindows} — so it is
 * longer than the 5s it was when the card also stood through the claim being spoken. Eight keeps
 * the time on screen roughly where it was, which is what a viewer actually has to read a sentence
 * and press a thumb in.
 *
 * Long enough to do that, short enough that the next claim is not queuing behind it. Claims in the
 * test debate land 5–9s apart at their closest, so a couple will overlap at this length — which is
 * what the stack is for, and reads as a feed rather than a queue.
 */
export const CLAIM_LINGER_MS = 8_000;

/**
 * A claim eligible to surface over the video, with the window its *card* is on screen for.
 *
 * Not the claim's own times — those are on `claim.timing`, and the scrubber marker uses them to
 * jump to where it was said. These two say when the card appears and disappears.
 */
export type TickerWindow = { claim: TimedClaim; startMs: number; endMs: number };

/**
 * The claims eligible to surface over the video, in the order they are said.
 *
 * **A card appears when the claim has been said, not when it starts.** Anchored to the start it
 * arrived while the debater was still mid-sentence, so the card asserted a claim the viewer had not
 * heard them make yet — it read as the app putting words in their mouth, and the reader was being
 * asked to agree with something still being argued. Anchored to the end it reads as "he just said
 * this — do you agree?", which is the question this layer exists to ask.
 *
 * That also retires the cap this used to need. A window running from the claim's start had to be
 * clamped so a long claim did not leave its card up over the next one; measured from the end, every
 * window is {@link CLAIM_LINGER_MS} long whatever the claim did.
 *
 * Only confidently-placed claims qualify. A claim the matcher put in roughly the right region is
 * fine in a list and not fine over the video, where the card asserts *this is what he just said* —
 * and being wrong about that misquotes a real person. Those claims still appear in the panel.
 */
export function tickerWindows(claims: TimedClaim[]): TickerWindow[] {
  return windowsFor(claims, claim => isAssertableMoment(claim.timing));
}

/**
 * The same windows for the backlog, which takes any claim it can place at all.
 *
 * The live layer and the backlog are asking different questions. A card asserts "they said this, at
 * this moment", so it needs a moment firm enough to stand behind — {@link isAssertableMoment}. The
 * backlog only claims "they have said this already", and a whole-turn fallback answers that
 * perfectly well: its window ends when the turn does, so the claim joins the list once the turn is
 * over, which is exactly when it became true.
 *
 * Built separately rather than filtered from one list, because sharing the list is what made the
 * corner quietly disagree with itself: the chip counted "N claims" and the list opened on a subset,
 * missing every claim the matcher had placed only loosely.
 *
 * How much that hides depends entirely on how many claims carry published offsets, which is a
 * moving number — a backfill raises it, every newly recorded debate lowers it, and it reaches
 * nothing-to-hide only when the extractor emits offsets itself (GEO-2958). No count is recorded
 * here for that reason: it would be wrong by the next debate, and a comment that has to be right
 * about a live corpus is a comment that will be wrong.
 */
export function backlogWindows(claims: TimedClaim[]): TickerWindow[] {
  return windowsFor(claims, claim => claim.timing !== null);
}

function windowsFor(claims: TimedClaim[], include: (claim: TimedClaim) => boolean): TickerWindow[] {
  return claims
    .filter(include)
    .map(claim => {
      const timing = claim.timing as NonNullable<TimedClaim['timing']>;
      return { claim, startMs: timing.endMs, endMs: timing.endMs + CLAIM_LINGER_MS };
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * How many cards are live over the video at once, before the older one is dropped.
 *
 * One. Two cards are taller than the corner has room for on a tile of any realistic size, and a
 * flex column that overflows a `justify-end` box overflows *downward* — so the second claim pushed
 * the newest card below the tile, where it was cut in half at the seam between the two debaters.
 *
 * Making room instead would mean a shorter card or a smaller type size, and the card is already at
 * the frame's size. So the older claim now leaves as the new one arrives, which is also the more
 * honest thing for a live layer to do: the corner shows what is being said. Nothing is lost — the
 * backlog is one hover or one tap away, and that is where reading back through it belongs.
 */
const MAX_STACKED_CARDS = 1;

/** Long enough to register as arriving rather than blinking into place. */
const FADE_IN_MS = 250;
/** The tail of a card's window, over which it fades out instead of vanishing. */
const FADE_OUT_MS = 1_500;

/**
 * How visible a card is at this moment, in [0, 1].
 *
 * Driven by the playhead rather than a CSS animation, because the playhead is the source of truth
 * and it can jump: a viewer who scrubs back into the middle of a claim should find the card at full
 * strength, not mid-way through an animation that started when the element mounted.
 */
export function cardOpacity(window: TickerWindow, playheadMs: number): number {
  if (playheadMs < window.startMs || playheadMs >= window.endMs) return 0;

  const sinceStart = playheadMs - window.startMs;
  if (sinceStart < FADE_IN_MS) return sinceStart / FADE_IN_MS;

  const untilEnd = window.endMs - playheadMs;
  if (untilEnd < FADE_OUT_MS) return untilEnd / FADE_OUT_MS;

  return 1;
}

export type StackedCard = { window: TickerWindow; opacity: number };

/**
 * The claims on screen right now, oldest first.
 *
 * Rendered in this order down a column, the newest card sits at the bottom, nearest the debater's
 * name, and earlier ones ride up above it — the shape of a live chat rather than a dialog.
 *
 * A card expires with its window and the corner goes quiet again. Cards were briefly made permanent
 * so there was always something to go back to; that is what {@link claimHistory} is for now, and it
 * is a better answer, because it does not cost the video a permanently occupied corner to get it.
 *
 * Answering does *not* retire a card early. It used to, which took the side the viewer had just
 * chosen off the screen before they saw it land; the filled icon is the acknowledgement, and the
 * window runs out on its own soon enough.
 */
export function tickerStack(
  windows: TickerWindow[],
  playheadMs: number,
  max: number = MAX_STACKED_CARDS
): StackedCard[] {
  return (
    spokenSoFar(windows, playheadMs)
      .filter(window => playheadMs < window.endMs)
      // Drop the oldest when there are more than fit, so what is on screen is what was just said.
      .slice(-max)
      .map(window => ({ window, opacity: cardOpacity(window, playheadMs) }))
  );
}

/**
 * Every claim said so far, oldest first — the list the corner opens into on hover.
 *
 * Not bounded by the card windows: this is the backlog, and the whole point of it is the claims
 * whose moment has passed. Bounded by the playhead instead, because a claim the viewer has not
 * reached yet is a spoiler and "scroll back through what was said" is only a statement about what
 * is behind them.
 *
 * All at full strength: the live stack's gradient says "this one is passing", which is the wrong
 * thing to say about a list someone has deliberately opened to read.
 */
export function claimHistory(windows: TickerWindow[], playheadMs: number): StackedCard[] {
  return spokenSoFar(windows, playheadMs).map(window => ({ window, opacity: 1 }));
}

/** `windows` arrives sorted by {@link tickerWindows}, so this stays in spoken order. */
function spokenSoFar(windows: TickerWindow[], playheadMs: number): TickerWindow[] {
  return windows.filter(window => playheadMs >= window.startMs);
}

export type ClaimMarker = {
  id: string;
  text: string;
  /** Where the hash sits: the moment the claim finished being said. */
  atMs: number;
  /**
   * Where a click on it jumps to, which is *not* where it sits.
   *
   * A card's window opens at `atMs` and fades in over {@link FADE_IN_MS}, so its opacity at that
   * exact instant is zero. The scrubber is mostly used while paused, where the playhead then stays
   * put — so seeking to the hash showed the viewer nothing at all, on the one interaction whose
   * entire purpose is to show them that claim. Landing just inside the window costs a quarter of a
   * second of accuracy and is the difference between a card and a blank corner.
   *
   * Held short of where the player calls the debate over, because it takes the whole corner down
   * at that point — so an offset that ran past produced exactly the blank it was added to prevent.
   * "Over" is {@link PLAYBACK_END_EPSILON_MS} short of the duration, not the duration itself: the
   * first version of this clamp used `timelineMs - 1`, still landed inside that window, and took
   * the corner down exactly as before. The shared constant is what stops the two files disagreeing
   * about where the end is.
   *
   * A claim whose window opens after the last seekable instant gets no hash at all — see
   * {@link claimMarkers}. Clamping alone cannot rescue that one: the seek would land *before* the
   * window, and both the live stack and the backlog are bounded by `playheadMs >= startMs`, so the
   * claim would be in neither. Measured across 51 debates with published offsets, three end on
   * their last claim; the median has 45 seconds of tail after it.
   */
  seekMs: number;
  fraction: number;
  /**
   * How many claims this one hash stands for.
   *
   * Usually one. More when several claims finish in the same segment: {@link matchClaimWindow}
   * places a claim on segment boundaries, so two claims matched to the same window end on the same
   * millisecond and would otherwise draw two hashes at one point — where the later covers the
   * earlier and the first can never be reached with a pointer. Measured over the corpus as the
   * matcher places it, rather than from published offsets, 8 of 563 assertable claims share a
   * moment with a differently-worded claim, so this is ordinary rather than exotic.
   *
   * One hash per moment is also the truer model. The stack shows one card at a time, so seeking
   * here surfaces the newest of them and leaves the rest a scroll away in the backlog — which is
   * what the hash was promising. `id` and `text` are that newest claim's for the same reason: they
   * are what the hash's label and tooltip say, and a label has to name the card it lands on.
   */
  count: number;
};

/**
 * Where each claim sits on the scrubber, as a fraction of the debate's length.
 *
 * Marked at the claim's *end*, like the card — see {@link tickerWindows}. A hash that sat at the
 * start put the mark somewhere the card would not appear for several more seconds, so the two ways
 * the timeline talks about one claim disagreed. Jumping to a hash now lands where its card does.
 *
 * `timelineMs` is the debate's own timeline, which is what the scrubber track measures. It used to
 * be the latest claim's end, which is only the same number when the last claim runs to the final
 * second — otherwise every marker was stretched rightwards by the difference. Measured across live
 * debates that reached 11%, roughly 20 seconds out on a 210-second debate.
 *
 * Same bar as the card, {@link isAssertableMoment}. Markers used to take any match at all, on the
 * reasoning that a marker is only an offer to jump and landing a second or two off costs nothing.
 * That was wrong in a way a real debate showed plainly: "A man should always pay for the first
 * date" matched all twelve of its claims between 0.37 and 0.52, so the scrubber drew eight hashes
 * and not one of them ever produced a card. A hash is a promise that something is there, and eight
 * broken promises read as the feature being broken rather than as the matcher being unsure.
 *
 * The cost is that a debate we cannot place confidently now shows no hashes, which is the honest
 * answer — its claims are still in the panel, where a list makes no claim about when.
 */
export function claimMarkers(claims: TimedClaim[], timelineMs: number): ClaimMarker[] {
  // The last instant the player does not already call the end of the debate. Below zero the whole
  // recording sits inside that window, so no seek can put a card up and a hash would be promising
  // something nothing can deliver. It also stands in for the old `timelineMs <= 0` guard, which
  // this is strictly narrower than, and keeps `fraction` off a zero denominator.
  const lastSeekableMs = timelineMs - PLAYBACK_END_EPSILON_MS - 1;
  if (lastSeekableMs < 0) return [];

  return (
    claims
      .filter(claim => isAssertableMoment(claim.timing))
      // And reachable: a window that opens at or after the last seekable instant cannot be entered.
      // `spokenSoFar` admits a claim only from `startMs` onwards, and `startMs` is the claim's end,
      // so a seek short of it shows nothing in the live stack *or* the backlog. A hash is a promise
      // that something is there; for these there is nowhere to land, so there is no hash.
      .filter(claim => (claim.timing as NonNullable<TimedClaim['timing']>).endMs < lastSeekableMs)
      .map(claim => {
        const timing = claim.timing as NonNullable<TimedClaim['timing']>;
        return {
          id: claim.id,
          text: claim.text,
          atMs: timing.endMs,
          // Just inside the card's window, and short of where the player calls it over — see
          // `seekMs` for both halves of that.
          seekMs: Math.min(timing.endMs + FADE_IN_MS, lastSeekableMs),
          fraction: Math.max(0, Math.min(1, timing.endMs / timelineMs)),
          count: 1,
        };
      })
      .sort((a, b) => a.atMs - b.atMs)
      // One hash per moment — see {@link ClaimMarker.count}. Sorted first, so claims sharing a
      // moment are adjacent, and the *last* of them is the survivor: `tickerStack` keeps one card
      // and takes it from the end of the group, so this is the sentence a click actually puts on
      // screen. Taking the first instead left the hash labelled with one claim and showing another.
      .reduce<ClaimMarker[]>((kept, marker) => {
        const last = kept[kept.length - 1];
        if (last && last.atMs === marker.atMs) {
          kept[kept.length - 1] = { ...marker, count: last.count + 1 };
          return kept;
        }
        kept.push(marker);
        return kept;
      }, [])
  );
}

/**
 * How long the running tally stays up after a claim lands.
 *
 * The tally is a *cue*, not furniture. A permanent counter over the video is the same mistake as a
 * permanent chip — see `ClaimBacklogChip` — so it arrives with the claim, says how many that makes,
 * and goes. Slightly longer than the burst it accompanies, so the number is still there to read
 * once the `+1` has flown.
 */
export const TALLY_LINGER_MS = 2_600;
/** The `+1` itself: up and gone well before the tally it lands in. */
export const TALLY_BURST_MS = 900;

/**
 * How close together claims have to land to count as one passage of argument.
 *
 * Measured rather than chosen would be better, and cannot be yet: the corpus places most claims by
 * matching them to a turn, so the gaps between them are only as good as the matcher. Thirty
 * seconds is the length of a short turn, so a run is "several points inside about one speech" —
 * which is the thing worth marking. It is deliberately not "claims in this turn", because the
 * ticker has no turn boundaries and giving it some to answer this would be the tail wagging.
 */
export const RUN_WINDOW_MS = 30_000;
/** Below this it is not a run, it is two claims. */
export const RUN_LENGTH = 3;

export type ClaimTally = {
  /** Claims this debater has made by this point in the debate. */
  count: number;
  /** How long ago the newest one landed. The animation's clock, and the playhead's, not the DOM's. */
  ageMs: number;
  /**
   * How many claims landed back to back inside {@link RUN_WINDOW_MS}, the newest included.
   *
   * Always at least 1. The tally says so once it reaches {@link RUN_LENGTH}, which is the only
   * thing here that celebrates rather than reports — so it is held to a bar that a debater
   * making their case at an ordinary pace will not trip.
   */
  run: number;
};

/**
 * The running claim count for one debater, at this playhead.
 *
 * Counted over the *backlog* windows rather than the live ones, deliberately. Those are the claims
 * the corner opens into and the number `ClaimBacklogChip` already prints, and a tally that said
 * "7 claims" beside a list of nine would be the same disagreement `renderableClaims` exists to
 * stop. The looser bar is also the honest one for this sentence: the tally only claims they have
 * said this many things, which a whole-turn match answers perfectly well — it is a *card* that
 * asserts a moment and needs {@link isAssertableMoment}.
 *
 * `null` for most of a debate, which is the resting state: nothing has just been said.
 */
export function claimTally(windows: TickerWindow[], playheadMs: number): ClaimTally | null {
  const said = windows.filter(window => playheadMs >= window.startMs);
  const newest = said[said.length - 1];
  if (!newest) return null;

  const ageMs = playheadMs - newest.startMs;
  if (ageMs >= TALLY_LINGER_MS) return null;

  // Walk back from the newest while each claim is still inside the window of the one after it.
  let run = 1;
  for (let index = said.length - 1; index > 0; index -= 1) {
    if (said[index].startMs - said[index - 1].startMs > RUN_WINDOW_MS) break;
    run += 1;
  }

  return { count: said.length, ageMs, run };
}

/** The whole debate's count for one debater, for the card that closes the video. */
export function finalClaimTally(windows: TickerWindow[]): ClaimTally | null {
  return windows.length > 0 ? { count: windows.length, ageMs: 0, run: 1 } : null;
}
