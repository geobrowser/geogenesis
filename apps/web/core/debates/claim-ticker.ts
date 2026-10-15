import { uuidToHex } from '~/core/id/normalize';

import type { Debate, DebateParticipant } from './api';
import { type TimedClaim, isAssertableMoment } from './claim-timing';
import { PLAYBACK_END_EPSILON_MS, orderedParticipants } from './playback-utils';
import type { DebateTranscriptClaims } from './transcript-claims';

/**
 * How long after a claim is said its window stays open. The claim counter's list reads only where
 * a window starts (the moment the claim was said); this sets where it ends.
 */
export const CLAIM_LINGER_MS = 8_000;

/**
 * A claim with its window: `startMs` is the moment it was said, when it joins its debater's count.
 *
 * Not the claim's own times — those are on `claim.timing`, and the scrubber marker uses them to
 * jump to where it was said.
 */
export type TickerWindow = { claim: TimedClaim; startMs: number; endMs: number };

/**
 * Each claim's window, in the order the claims were said, for the claim counter and its list. Any
 * claim it can place at all.
 *
 * A window opens when the claim has been *said*, not when it starts: a claim counted while the
 * debater is still mid-sentence asserts something the viewer has not heard them make yet. A
 * whole-turn fallback answers "they have said this already" perfectly well: its window opens when
 * the turn ends, so the claim joins the list once the turn is over, which is exactly when it became
 * true. The scrubber's hashes are stricter, and take only {@link isAssertableMoment} claims.
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

/** How far past a claim's moment its scrubber hash seeks: see `ClaimMarker.seekMs`. */
const FADE_IN_MS = 250;
/** One claim said so far, as the claim counter's list holds it. */
export type ClaimHistoryEntry = { window: TickerWindow };

/**
 * Every claim said so far, oldest first — what the claim counter counts and opens into.
 *
 * Bounded by the playhead, because a claim the viewer has not reached yet is a spoiler and "scroll
 * back through what was said" is only a statement about what is behind them.
 */
export function claimHistory(windows: TickerWindow[], playheadMs: number): ClaimHistoryEntry[] {
  return spokenSoFar(windows, playheadMs).map(window => ({ window }));
}

/** `windows` arrives sorted by {@link backlogWindows}, so this stays in spoken order. */
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
   * A claim's window opens at `atMs`, and the scrubber is mostly used while paused, where the
   * playhead then stays put. Landing {@link FADE_IN_MS} inside the window rather than on its edge
   * puts the claim in the counter's list however the playhead rounds, for a quarter of a second of
   * accuracy.
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
   * window, and the counter's list is bounded by `playheadMs >= startMs`, so the claim would not be
   * in it. Measured across 51 debates with published offsets, three end on
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
   * `id` and `text` are the newest of them, the one nearest the counter when the list opens: they
   * are what the hash's label and tooltip say.
   */
  count: number;
};

/**
 * Where each claim sits on the scrubber, as a fraction of the debate's length.
 *
 * Marked at the claim's *end*, where it joins the counter — see {@link backlogWindows}. A hash at
 * the start would point somewhere the claim has not been counted yet.
 *
 * `timelineMs` is the debate's own timeline, which is what the scrubber track measures. It used to
 * be the latest claim's end, which is only the same number when the last claim runs to the final
 * second — otherwise every marker was stretched rightwards by the difference. Measured across live
 * debates that reached 11%, roughly 20 seconds out on a 210-second debate.
 *
 * Only {@link isAssertableMoment} claims. Markers used to take any match at all, on the
 * reasoning that a marker is only an offer to jump and landing a second or two off costs nothing.
 * That was wrong in a way a real debate showed plainly: "A man should always pay for the first
 * date" matched all twelve of its claims between 0.37 and 0.52, so the scrubber drew eight hashes
 * and not one of them was where its claim was said. A hash is a promise that something is there, and eight
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
      // so a seek short of it shows nothing in the counter's list. A hash is a promise
      // that something is there; for these there is nowhere to land, so there is no hash.
      .filter(claim => (claim.timing as NonNullable<TimedClaim['timing']>).endMs < lastSeekableMs)
      .map(claim => {
        const timing = claim.timing as NonNullable<TimedClaim['timing']>;
        return {
          id: claim.id,
          text: claim.text,
          atMs: timing.endMs,
          // Just inside the claim's window, and short of where the player calls it over — see
          // `seekMs` for both halves of that.
          seekMs: Math.min(timing.endMs + FADE_IN_MS, lastSeekableMs),
          fraction: Math.max(0, Math.min(1, timing.endMs / timelineMs)),
          count: 1,
        };
      })
      .sort((a, b) => a.atMs - b.atMs)
      // One hash per moment — see {@link ClaimMarker.count}. Sorted first, so claims sharing a
      // moment are adjacent, and the *last* of them is the survivor: the newest, which sits nearest
      // the counter when its list opens.
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
 * Who said each claim, keyed by claim id.
 *
 * Attribution rides the *block*, not the claim: a claim's own space is the debate's publication
 * space, which both debaters share. The block's `Authors` relation points at the speaker's personal
 * space, which is the id the participant list keys on.
 *
 * Shared by the live claim cards and the end card's carousel, so a claim is credited to the same
 * person in both. A restated claim is credited to nobody.
 */
export function speakersByClaimId(
  debate: Debate,
  claims: Pick<DebateTranscriptClaims, 'all' | 'blocks'>
): Map<string, DebateParticipant> {
  const bySpace = new Map<string, DebateParticipant>();
  for (const participant of orderedParticipants(debate)) {
    bySpace.set(uuidToHex(participant.profile_space_id), participant);
  }

  const byBlock = new Map<string, DebateParticipant>();
  for (const block of claims.blocks) {
    const speaker = block.authorSpaceId ? bySpace.get(uuidToHex(block.authorSpaceId)) : undefined;
    if (speaker) byBlock.set(block.id, speaker);
  }

  const speakers = new Map<string, DebateParticipant>();
  for (const claim of claims.all) {
    // Linked from more than one turn, so its block is only the first of them and cannot say who
    // made it — see `restated`. Uncredited, it never reaches a card that names a speaker.
    if (claim.restated) continue;
    const speaker = byBlock.get(claim.blockId);
    if (speaker) speakers.set(claim.id, speaker);
  }
  return speakers;
}

/**
 * The claims a card can actually be drawn for, in the order given.
 *
 * A claim needs a speaker the participant list recognises, so the card can attribute it, and a
 * space to answer in — without either, `DebateClaimTickerCard` renders nothing.
 *
 * Two claim entities can also carry the same text *and* the same published moment — measured: 11
 * such claims, all in one debate whose claims appear to have been published twice — and drawing
 * both doubles every card. The key is text **and** moment rather than text alone: a debater who
 * genuinely repeats themselves later has said something new, and keeps their card.
 */
export function drawableClaims(claims: TimedClaim[], speakers: ReadonlyMap<string, DebateParticipant>): TimedClaim[] {
  const seen = new Set<string>();
  return claims.filter(claim => {
    if (claim.spaceId === null || !speakers.has(claim.id)) return false;

    const key = `${claim.timing?.endMs ?? 'unplaced'} ${claim.text.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
