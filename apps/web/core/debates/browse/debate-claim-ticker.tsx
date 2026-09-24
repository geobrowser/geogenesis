'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate, DebateClaim, DebateParticipant } from '~/core/debates/api';
import {
  type ClaimMarker,
  type StackedCard,
  type TickerWindow,
  backlogWindows,
  claimHistory,
  claimMarkers,
  tickerStack,
  tickerWindows,
} from '~/core/debates/claim-ticker';
import { claimsInSpokenOrder } from '~/core/debates/claim-timing';
import { useDebateClaimsBySpaces } from '~/core/debates/hooks';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { uuidToHex } from '~/core/id/normalize';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { InfoSmall } from '~/design-system/icons/info-small';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';
import { Tooltip } from '~/design-system/tooltip';

import { useLineClampOverflow } from './line-clamp-overflow';
import { useDebateClaimResponse } from './use-debate-claim-response';
import { useOpenDebaterProfile } from './use-open-debater-profile';

type DebateTicker = {
  /**
   * The cards to draw right now, oldest first, keyed by the participant slot that said them.
   *
   * One corner per debater rather than one for the player. A viewer watching a debate is looking at
   * whoever is talking, so that is where their claims should appear — a single shared corner asks
   * the eye to leave the speaker to read what the speaker is saying.
   */
  cardsBySlot: Map<number, StackedCard[]>;
  /**
   * Every claim each debater has said so far, oldest first — what their corner opens into.
   *
   * Bounded by the playhead, so it is a record of what has been said rather than a table of
   * contents for what is coming.
   */
  historyBySlot: Map<number, StackedCard[]>;
  /** Every precisely-placed claim, for the scrubber. */
  markers: ClaimMarker[];
  /** Which way the viewer answered each claim this session. */
  answers: ReadonlyMap<string, boolean>;
  onAnswered: (claimId: string, position: boolean | null) => void;
  /** Per-claim lookups, hoisted so the card and the end-of-debate stack share one batch. */
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  /** Claim id → the debater who said it, for the avatar and name the live card wears. */
  participantByClaimId: Map<string, DebateParticipant>;
};

/**
 * Everything the live claim layer needs for one debate.
 *
 * Both reads are shared cache entries rather than new requests: the claims come back on the same
 * key the feed's count badge and the Claims panel already use, and the transcript on the same key
 * `useDebatePlayback` fetches for subtitles. On a card that is playing, this costs nothing.
 */
export function useDebateClaimTicker(
  debate: Debate,
  {
    playheadMs,
    /** The debate's own timeline, which is what the scrubber track measures. */
    timelineMs,
    enabled,
  }: { playheadMs: number; timelineMs: number; enabled: boolean }
): DebateTicker {
  const { claims } = useDebateTranscriptClaims(debate.id, debate.claim.space_id, enabled);
  const { timings } = useClaimTimings(debate.id, claims, enabled);

  const [answers, setAnswers] = React.useState<ReadonlyMap<string, boolean>>(() => new Map());

  // Recorded, not acted on. Answering used to also dismiss the card, which took the side the
  // viewer had just chosen off the screen before they saw it land; the filled icon is the
  // acknowledgement now, and the card stays until a newer claim displaces it. The end-of-debate
  // card still reads this to skip what has already been answered.
  const onAnswered = React.useCallback((claimId: string, position: boolean | null) => {
    setAnswers(current => {
      // Identity is the bail-out: React skips the update when the state comes back unchanged, which
      // is what lets every card report on mount without a re-render apiece.
      if (position === null) {
        if (!current.has(claimId)) return current;
        const next = new Map(current);
        next.delete(claimId);
        return next;
      }
      if (current.get(claimId) === position) return current;
      return new Map(current).set(claimId, position);
    });
  }, []);

  // Attribution rides the *block*, not the claim: a claim's own space is the debate's publication
  // space, which both debaters share. The block's `Authors` relation points at the speaker's
  // personal space, which is the id the participant list keys on.
  const participantByClaimId = React.useMemo(() => {
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
      const speaker = byBlock.get(claim.blockId);
      if (!speaker) continue;
      speakers.set(claim.id, speaker);
    }
    return speakers;
  }, [claims.all, claims.blocks, debate]);

  const timedClaims = React.useMemo(() => claimsInSpokenOrder(claims.all, timings), [claims.all, timings]);

  /**
   * One gate for everything this surface offers, so the three ways it points at a claim agree.
   *
   * A claim needs two things before it can be drawn: a speaker the participant list recognises, so
   * the card can attribute it, and a space to answer in — without either, `DebateClaimTickerCard`
   * renders nothing. Applied here rather than at each consumer because the consumers were drifting:
   * cards dropped these claims, while the scrubber drew a clickable hash for them and the chip
   * counted them, so both promised a card that could never appear. A hash nothing is behind is the
   * same broken promise {@link claimMarkers} already turns low-confidence matches away to avoid.
   *
   * Neither of those trips in the corpus today — measured over all 854 published claims, every one
   * has a space and an authored block. They are for the debates recorded after this one.
   *
   * **Empty while the ticker is switched off.** `useDebateTranscriptClaims` is gated on `enabled`,
   * but the feed card and the explore card fetch the same query ungated, so a disabled ticker reads
   * a full claim list out of a warm cache. `groupBySlot` already refused to build cards from it;
   * the markers did not, so an inactive feed card could draw a clickable hash that seeks to a claim
   * whose card and backlog are both deliberately empty. One gate now, not two half-gates.
   *
   * **The third rule is about what a viewer can tell apart.** Two claim entities can carry the same
   * text *and* the same published moment, and then everything downstream doubles: two identical
   * cards in the backlog, a chip counting them twice, and two markers at one spot where the later
   * one covers the earlier so the first is unreachable by pointer. Measured: 11 such claims, all in
   * one debate, whose claims appear to have been published twice; and zero cases of the same text
   * at *different* moments, which is why the key is text **and** moment rather than text alone — a
   * debater who genuinely repeats themselves later has said something new, and keeps their card.
   *
   * What the collapse cannot fix is that the twin is a separate entity with its own responses, so
   * an answer lands on whichever copy survived here. That is an argument for de-duplicating on
   * publish, not for showing the same sentence twice.
   */
  const renderableClaims = React.useMemo(() => {
    if (!enabled) return [];

    const seen = new Set<string>();
    return timedClaims.filter(claim => {
      if (claim.spaceId === null || !participantByClaimId.has(claim.id)) return false;

      const key = `${claim.timing?.endMs ?? 'unplaced'} ${claim.text.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [enabled, participantByClaimId, timedClaims]);

  // Two lists, because the live layer and the backlog answer different questions — see
  // `backlogWindows`. Cards and markers assert a moment; the backlog only says "already said".
  const windows = React.useMemo(() => tickerWindows(renderableClaims), [renderableClaims]);
  const backlog = React.useMemo(() => backlogWindows(renderableClaims), [renderableClaims]);
  const markers = React.useMemo(() => claimMarkers(renderableClaims, timelineMs), [renderableClaims, timelineMs]);

  // One batch for every claim, the way the panel does it, so the live card and the end-of-debate
  // stack never issue a lookup per claim as they mount.
  const claimIds = React.useMemo(() => claims.all.map(claim => claim.id), [claims.all]);
  const { entities } = useQueryEntities({
    where: { id: { in: claimIds } },
    first: claimIds.length || 1,
    enabled: enabled && claimIds.length > 0,
  });
  const entitiesByClaimId = React.useMemo(() => {
    const map = new Map<string, Entity>();
    for (const entity of entities) map.set(entity.id, entity);
    return map;
  }, [entities]);

  /**
   * Empty while this ticker is switched off, which is not the same as having no claims.
   *
   * `useDebateTranscriptClaims` is gated on `enabled`, but the feed card and the explore card both
   * fetch the same query *ungated* — so the cache is warm and a disabled ticker still reads a full
   * claim list out of it. Handing that to `useDebateClaimsBySpaces`, which has no gate of its own,
   * started authenticated row queries and a gateway subscription for every mounted feed item rather
   * than the active and preloaded pair.
   */
  const rowGroups = React.useMemo(() => {
    if (!enabled) return [];

    const bySpace = new Map<string, string[]>();
    for (const claim of claims.all) {
      if (!claim.spaceId) continue;
      const ids = bySpace.get(claim.spaceId);
      if (ids) ids.push(claim.id);
      else bySpace.set(claim.spaceId, [claim.id]);
    }
    return [...bySpace].map(([spaceId, ids]) => ({ spaceId, claimIds: ids }));
  }, [enabled, claims.all]);

  const rowsQuery = useDebateClaimsBySpaces(rowGroups);
  const rowsByClaimId = React.useMemo(() => {
    const map = new Map<string, DebateClaim>();
    for (const row of rowsQuery.claims) map.set(row.claim_entity_id, row);
    return map;
  }, [rowsQuery.claims]);

  // One stack per debater, over their own tile. A claim whose speaker could not be resolved —
  // attribution and the participant list can disagree — never reaches here, because
  // `renderableClaims` has already turned it away rather than letting it be parked over whichever
  // half: putting a claim over the wrong face is the misquote this whole layer is careful about,
  // and now that the corner itself attributes, getting it wrong is louder. The lookup stays because
  // it is how the slot is read, and it is the one place the two could fall out of step.
  const groupBySlot = React.useCallback(
    (source: TickerWindow[]) => {
      const bySlot = new Map<number, TickerWindow[]>();
      // Belt and braces: `renderableClaims` is empty while disabled, so `source` already is. Kept
      // because this is a public-ish shape and a future caller could pass windows from elsewhere.
      if (!enabled) return bySlot;

      for (const window of source) {
        const slot = participantByClaimId.get(window.claim.id)?.participant_slot;
        if (slot === undefined) continue;
        const existing = bySlot.get(slot);
        if (existing) existing.push(window);
        else bySlot.set(slot, [window]);
      }
      return bySlot;
    },
    [enabled, participantByClaimId]
  );

  const liveBySlot = React.useMemo(() => groupBySlot(windows), [groupBySlot, windows]);
  const backlogBySlot = React.useMemo(() => groupBySlot(backlog), [groupBySlot, backlog]);

  const cardsBySlot = React.useMemo(() => {
    const cards = new Map<number, StackedCard[]>();
    for (const [slot, slotWindows] of liveBySlot) cards.set(slot, tickerStack(slotWindows, playheadMs));
    return cards;
  }, [liveBySlot, playheadMs]);

  const historyBySlot = React.useMemo(() => {
    const history = new Map<number, StackedCard[]>();
    for (const [slot, slotWindows] of backlogBySlot) history.set(slot, claimHistory(slotWindows, playheadMs));
    return history;
  }, [backlogBySlot, playheadMs]);

  return {
    cardsBySlot,
    historyBySlot,
    markers,
    answers,
    onAnswered,
    rowsByClaimId,
    entitiesByClaimId,
    participantByClaimId,
  };
}

/**
 * The stack's dissolve, taken from the mask the Figma frame actually ships.
 *
 * That mask is a 209×168 alpha rect filled with a vertical gradient running `y1=0 → y2=71.5`, with
 * stops at `0.065` (white, opacity 0) and `1` (white): nothing shows for the first 4.65px, the ramp
 * climbs from there to fully opaque at 71.5px, and the remaining ~96px of the rect is solid. The
 * frame positions that one rect per card — `mask-position 0,-71px` on the newest, `0,18px` on the
 * one above — rather than giving each card a gradient of its own, which is the same thing as
 * anchoring the ramp to the top of the stack region and letting each card carry its slice.
 *
 * Reproduced per card for a second reason as well: a `mask-image` makes its element a Backdrop
 * Root, so a mask on the scroll box leaves any `backdrop-filter` inside it nothing to sample. An
 * element's own mask does not blind its own — measured in Chrome, a card over hard stripes reads
 * 160 contrast unmasked, 178 masked itself, and 249 with the mask on its parent.
 */
const HISTORY_EDGE_OPAQUE_PX = 71.5;
/** The lead-in: the gradient's first stop sits 6.5% down its 71.5px, and nothing shows above it. */
const HISTORY_EDGE_CLEAR_PX = 4.65;

/**
 * The claim card that rises over the video as it is said.
 *
 * A translucent dark card in the player's bottom-right corner, stacked upward: the newest arrives
 * at the bottom and earlier ones ride up and dissolve, which is the shape of a chat rather than a
 * dialog. It never pauses the video or opens anything — the only thing that interrupts playback is
 * the sign-in prompt, which is the app's standard prompt and only appears if the viewer presses a
 * thumb while signed out.
 */
export function DebateClaimTickerCard({
  window,
  opacity = 1,
  speaker = null,
  row,
  entity,
  onAnswered,
}: {
  window: TickerWindow;
  /** Driven by the playhead, so a scrub lands on the right strength rather than mid-animation. */
  opacity?: number;
  /** Who said it. The card names them, so it no longer has to sit over their tile to attribute. */
  speaker?: DebateParticipant | null;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string, position: boolean | null) => void;
}) {
  const { claim } = window;

  if (!claim.spaceId) return null;

  return (
    <div
      // The video behind is one big play/pause button; without this every tap on a thumb would
      // also toggle playback.
      onClick={event => event.stopPropagation()}
      // Left off entirely at full strength, so the open list's edge fade — which writes this
      // property straight to the node on scroll — is not overwritten on the next render.
      style={opacity === 1 ? undefined : { opacity }}
      /**
       * `rgba(21,21,21,0.3)`, 8px radius, 12px padding, 6px between the header and the claim, over a
       * 44px backdrop blur.
       *
       * Every value but the blur is read straight off the frame. The blur is fitted, because the
       * Dev Mode export does not carry it — there is no `filter` or `backdrop` anywhere in that
       * file, and taking the omission at face value is how this card ended up flat.
       *
       * What gives it away is the render itself. Down the card's right edge the video outside runs
       * 176 → 54 as the tile's scrim ramps to black, while inside the card the same column barely
       * moves, 118 → 98 — and at the bottom the card is *brighter* than the backdrop it covers,
       * which no amount of dark translucent fill can do. Only a blur can, by averaging in the
       * brightness above. Rebuilding the tile from the same still and sweeping the radius puts the
       * best fit at 44px: mean error 5.7/255 against the frame, where no blur at all scores 20.0.
       *
       * `shrink-0` so the open list scrolls a full-height card rather than compressing it to fit.
       *
       * The ramp arrives as `--claim-ramp`, which {@link paintEdgeFade} only ever sets while the
       * backlog is open — a live card is never dissolved, on any device.
       *
       * It did come off entirely on touch for a while, because an expanded claim could end up half
       * dissolved with no way to bring it back. Two things since have made that the wrong cure: the
       * ramp lifts at the top of the list, which is where a reader who has scrolled back is, and
       * the open list is narrower than the live card on a phone now, so the fade reads as the edge
       * of a list rather than as damage to the claim you are reading.
       */
      className="pointer-events-auto flex w-full shrink-0 flex-col gap-1.5 rounded-lg bg-[#151515]/30 [mask-image:var(--claim-ramp,none)] p-3 backdrop-blur-[44px] [-webkit-mask-image:var(--claim-ramp,none)]"
    >
      <TickerClaimHeader
        claimId={claim.id}
        spaceId={claim.spaceId}
        speaker={speaker}
        row={row}
        entity={entity}
        onAnswered={onAnswered}
      />
      <TickerClaimText text={claim.text} />
    </div>
  );
}

/**
 * Two lines of a claim before the card starts covering the face saying it.
 *
 * Three was the frame's, and the arithmetic changed when the card got wider. Measured over all 854
 * published claims: three lines at 260px shows 66% of them whole, two lines at 360px shows 62% —
 * near enough the same reading, in a card 17px shorter. Height is the expensive dimension here,
 * because the speaker's face is in the middle of the tile and the card grows up towards it, while
 * width runs along the bottom where there is far less to cover.
 */
const TICKER_CLAMP_LINES = 2;

/**
 * The claim itself, clamped to three lines, and expandable in place when there is more.
 *
 * A claim runs to a sentence or two and three lines of a 209px card is often not all of it. The
 * alternative to expanding here is "go and find it in the panel", which means leaving the debate
 * to read a sentence that is on screen — so the text opens where it is, and closes again the same
 * way.
 *
 * Only interactive when it is actually truncated. A button that visibly does nothing is worse than
 * no button, and most short claims fit.
 */
function TickerClaimText({ text }: { text: string }) {
  // In state rather than a ref: wrapping the text in a button below remounts this node, and the
  // measurement has to follow it. See `useLineClampOverflow`.
  const [textElement, setTextElement] = React.useState<HTMLSpanElement | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  // A new claim in the same card slot starts collapsed rather than inheriting the last one's state.
  React.useEffect(() => setExpanded(false), [text]);

  const overflowing = useLineClampOverflow(textElement, {
    maxLines: TICKER_CLAMP_LINES,
    enabled: !expanded,
    contentKey: text,
  });

  const body = (
    <span
      ref={setTextElement}
      // `line-clamp-3` and `block` both set `display`, and `block` wins — which silently turns the
      // clamp off, so the card grows to fit the whole claim and nothing ever reports as truncated.
      // The clamp already blockifies the box; only the expanded state needs `block` of its own.
      className={cx(
        'text-[1rem] leading-[1.0625rem] tracking-[-0.16px] text-white',
        expanded ? 'block' : 'line-clamp-2'
      )}
    >
      {text}
    </span>
  );

  if (!overflowing && !expanded) return body;

  return (
    <button
      type="button"
      aria-expanded={expanded}
      title={expanded ? 'Show less' : 'Show the whole claim'}
      onClick={() => setExpanded(current => !current)}
      className="w-full cursor-pointer text-left"
    >
      {body}
    </button>
  );
}

/**
 * The claim cards in the player's bottom-right corner, oldest at the top.
 *
 * Anchored in the corner rather than centred over the video: a card in the middle reads as a
 * dialog demanding an answer, and it covers the face of the person making the argument.
 *
 * Two modes. Closed, it is the live layer: a claim appears as it is said, lingers, and goes, so the
 * corner is empty most of the time. Open — the viewer's pointer is anywhere over the player, or
 * they have tabbed into the stack — it becomes the whole of what has been said so far, scrollable,
 * newest at the bottom. That is the Twitch-chat bargain: the corner stays a corner while you are
 * watching, and the backlog is one movement away without pausing the video or opening a panel.
 *
 * `open` is the caller's, because the pointer has to be able to open this from anywhere over the
 * video — including when nothing is on screen here to point at, which is most of the time.
 */
export function DebateClaimTickerStack({
  cards,
  history,
  open = false,
  pinned = false,
  onTogglePinned,
  onFocusChange,
  participantByClaimId,
  rowsByClaimId,
  entitiesByClaimId,
  onAnswered,
}: {
  cards: StackedCard[];
  /** Everything said so far. Falls back to the live cards where a caller has no history. */
  history?: StackedCard[];
  /** Show the backlog rather than the live cards. */
  open?: boolean;
  /** Open because the chip was pressed rather than because the pointer is over the tile. */
  pinned?: boolean;
  /** Pressing the chip. Without it the corner has no chip and is hover-only. */
  onTogglePinned?: () => void;
  /** Keyboard focus entering or leaving the stack, which opens it the way the pointer does. */
  onFocusChange?: (focused: boolean) => void;
  participantByClaimId?: Map<string, DebateParticipant>;
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  onAnswered: (claimId: string, position: boolean | null) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const shown = open ? (history ?? cards) : cards;
  const backlog = history ?? cards;

  /**
   * Whether the list is sitting at its newest claim, and so should follow the next one down.
   *
   * A ref rather than state: it is read inside effects and never drawn, so tracking it in state
   * would re-render the list on every scroll frame to change nothing on screen.
   */
  const followingLatest = React.useRef(true);

  /**
   * Dissolve the top of the open list — see {@link HISTORY_EDGE_OPAQUE_PX}.
   *
   * Each card carries the slice of the ramp that falls across it, found by shifting the gradient's
   * stops by how far the card's own top sits from the top of the list. A card below the ramp
   * entirely gets no mask at all, which is nearly all of them.
   *
   * Written straight to the node rather than through state, because this runs on every scroll frame
   * and re-rendering the list to change a gradient on one card is work the browser should not be
   * asked to do while a finger is moving. React never sets `mask-image` on these cards, so there is
   * no tug of war over the property.
   */
  const paintEdgeFade = React.useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const atTop = element.scrollTop <= 1;
    for (const card of Array.from(element.children) as HTMLElement[]) {
      // The card's top edge, measured from the top of what the list is showing. Negative once the
      // card has started to travel up past it.
      const fromEdge = card.offsetTop - element.scrollTop;
      const clear = -fromEdge + HISTORY_EDGE_CLEAR_PX;
      const opaque = -fromEdge + HISTORY_EDGE_OPAQUE_PX;
      // Nothing to paint on a card the ramp does not reach, nor on one that has travelled wholly
      // above the edge, where the list's own overflow has it already.
      const untouched = opaque <= 0 || fromEdge + card.offsetHeight < 0;
      // `open` is checked here rather than by the callers, because the closed corner is a
      // content-sized box whose top *is* the card's top — the ramp would dissolve the live claim.
      //
      // `atTop` because a reader who has scrolled the list as far back as it goes is looking at the
      // oldest claim, and dissolving what they just scrolled to is the one moment the ramp works
      // against them. It is there to say "more above"; at the top there is not.
      const ramp =
        !open || atTop || untouched ? '' : `linear-gradient(to bottom, transparent ${clear}px, #000 ${opaque}px)`;
      // Through a custom property rather than `mask-image` itself: the card declares the standard
      // and `-webkit-` masks together in its own className, so one variable drives both and the
      // declarations stay with the rest of the card's styling.
      card.style.setProperty('--claim-ramp', ramp || 'none');
    }
  }, [open]);

  const onScroll = React.useCallback(() => {
    const element = scrollRef.current;
    if (element) {
      // A few px of slack: a list scrolled to the end is often a fraction of a pixel short of it.
      followingLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 8;
    }
    paintEdgeFade();
  }, [paintEdgeFade]);

  // Opens on the most recent claim — scrolling *up* from there is the "go back through it" this
  // exists for. Closing repaints too, and has to: the ramp is written to the card nodes, and the
  // newest card survives the close, so a stale slice of gradient would follow it back out.
  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (open) {
      followingLatest.current = true;
      element.scrollTop = element.scrollHeight;
    }
    paintEdgeFade();
  }, [open, paintEdgeFade]);

  /**
   * The list also re-follows the bottom when its geometry changes under it, not only when a claim
   * arrives. Two ways that happens, both reported from the preview:
   *
   * The scrubber appearing lifts the corner by `pb-5`, which shortens the scroll box. A shorter box
   * raises the maximum scrollTop, so a list that was resting at the bottom is suddenly short of it
   * and the newest card is cut off by the scrubber.
   *
   * Expanding a clamped claim makes its card taller. The card grows downward, past the bottom of
   * the box, so the reader taps to read the rest of a claim and the rest of it goes under the edge.
   *
   * Watching the children as well as the box is what catches the second one — the box does not
   * change size there, only its content does.
   */
  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (open && followingLatest.current) element.scrollTop = element.scrollHeight;
      paintEdgeFade();
    });
    observer.observe(element);
    for (const card of Array.from(element.children)) observer.observe(card);
    return () => observer.disconnect();
  }, [open, shown.length, paintEdgeFade]);

  // A claim arriving while the list is open lands at the bottom, and the list follows it only if
  // the reader was already down there. They open this to read back through what was said, and a
  // debate keeps talking while they do: yanking the view to the newest card took the sentence they
  // were halfway through off the screen, which read as the list closing and starting over.
  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (open && followingLatest.current) element.scrollTop = element.scrollHeight;
    paintEdgeFade();
  }, [open, shown.length, paintEdgeFade]);

  /**
   * The chip is the only thing on screen saying the backlog exists at all, and on a touch screen it
   * is the only way to reach it: there is no hover, and the video behind is one large play/pause
   * button, so the corner cannot quietly swallow a tap to mean something else.
   *
   * It yields to a live card, though. The card sits on top of it in the column, so a chip that
   * stayed up held the card 43px higher than it needed to be — and 43px up a phone tile is the
   * difference between a card under the speaker's chin and a card across their face. There is also
   * nothing for the chip to say in that moment: a claim is already on screen, which is the thing it
   * exists to announce.
   *
   * Still drawn while the backlog is *open*, because there it is the way back out.
   */
  const showChip = backlog.length > 0 && onTogglePinned !== undefined && (open || cards.length === 0);
  if (shown.length === 0 && !showChip) return null;

  return (
    <div
      className="flex min-h-0 w-full flex-col items-end gap-1.5"
      /**
       * The focus boundary is the whole stack, chip included, and it has to be.
       *
       * These lived on the scroll box, which is the chip's *sibling*. Tabbing from the last card to
       * the chip therefore left the box — `relatedTarget` outside `currentTarget` — and reported
       * focus gone. The player closed the backlog, `showChip` went false with a live card present,
       * and the chip unmounted underneath the keyboard mid-tab, dropping focus to the body. The one
       * control that can reopen the list was the one that could not be reached from inside it.
       */
      onFocus={event => {
        // A keyboard arriving, not a click landing.
        //
        // The player opens the backlog on this, and the backlog is drawn narrower than a live card
        // — so when any focus counted, clicking the expand toggle on a clamped claim swapped the
        // card the reader was halfway through for the list, at the list's width. They asked for
        // more of the sentence in front of them and got it somewhere else, in a different column.
        // Pressing a thumb on a live card did the same thing.
        //
        // `:focus-visible` is the browser's own answer to "did this focus come from a pointer",
        // which is exactly the question, and the same signal the backlog chip already uses to
        // decide when it is reachable. A click still focuses the control it landed on — it just no
        // longer reads as having tabbed in.
        if (event.target instanceof Element && !event.target.matches(':focus-visible')) return;
        onFocusChange?.(true);
      }}
      // Only when focus leaves the stack entirely — moving between two cards, or out to the chip,
      // must not collapse the list out from under the keyboard.
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocusChange?.(false);
      }}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        // The video behind is one big play/pause button, and the gaps between cards are holes in
        // this list that a thumb aiming at a card can find. The cards stop their own clicks; this
        // catches the misses.
        onClick={event => event.stopPropagation()}
        className={cx(
          'pointer-events-auto flex w-full flex-col gap-1.5',
          // Nothing live and nothing open: the chip is on its own, and an empty box between it and
          // the tile edge would still take its gap.
          shown.length === 0 && 'hidden',
          /**
           * 156px of backlog, and the number is picked between two constraints rather than chosen.
           *
           * Cards are 80px and sit 6px apart. The newest one is crisp only if the box is at least
           * `71.5 + 80 = 151.5px`, or the ramp reaches down into it. Two cards want 166px, so a box
           * of 166 or more never scrolls — and a list that never scrolls sits at its own top, where
           * the ramp correctly declines to fade anything. 156px is inside both: the newest card
           * clears the ramp by 4px, and two cards overflow by 10.
           *
           * In px on this element rather than a percentage on the host, which is what it used to
           * be. A percentage there was measured against the tile and then shared with the chip, so
           * on a phone the chip's 43px came out of the list's 130 and left 87 — one card, most of
           * it inside the ramp.
           */
          open && 'no-scrollbar max-h-[9.75rem] min-h-0 overflow-y-auto'
        )}
      >
        {shown.map(card => (
          <DebateClaimTickerCard
            key={card.window.claim.id}
            window={card.window}
            opacity={card.opacity}
            speaker={participantByClaimId?.get(card.window.claim.id) ?? null}
            row={rowsByClaimId.get(card.window.claim.id) ?? null}
            entity={entitiesByClaimId.get(card.window.claim.id) ?? null}
            onAnswered={onAnswered}
          />
        ))}
      </div>

      {/* `expanded` only where the chip is what is holding it open. A pointer closes the list by
          leaving the tile, so a chip offering to Hide it would be describing something it cannot
          do; a tap has nowhere to go, and there the way in has to double as the way out. */}
      {showChip && onTogglePinned && (
        <ClaimBacklogChip count={backlog.length} expanded={open && pinned} onClick={onTogglePinned} />
      )}
    </div>
  );
}

/**
 * The way into the backlog where there is no pointer to open it with.
 *
 * Shown on a device that cannot hover. Everywhere else the corner opens by pointing at the tile,
 * and a permanent pill duplicating that would be furniture over the video — the Figma frame has no
 * chip in it, and the resting player is quieter without one. It stays in the DOM there all the
 * same, because a keyboard has no pointer either; how that is done, and why not with `sr-only`, is
 * on the `className` below rather than restated here.
 *
 * Deliberately the same glyph the Claims button in the interaction bar uses, because it opens the
 * same set of claims. Two different icons for one idea would be the harder thing to learn.
 */
function ClaimBacklogChip({ count, expanded, onClick }: { count: number; expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={expanded ? 'Hide the claims said so far' : `Show the ${count} claims said so far`}
      // The video behind is one big play/pause button.
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      /**
       * 20px tall, which is the debater's avatar across the band from it — the two read as one row
       * when they match and as a mistake when they do not. The tap target is kept at ~36px by an
       * `::after` that reaches past the box without taking any layout.
       *
       * On a pointer device it is present but out of the way, not absent. It used to be `hidden`,
       * which took it out of the tab order too — and since the corner draws nothing at all when no
       * claim is live, which is most of a debate, that left a keyboard with no way into the backlog
       * whatsoever. `absolute opacity-0` keeps it focusable and costs no layout, and focus brings it
       * back into the flow so the focus ring lands on something the viewer can see.
       *
       * `pointer-events-none` is stated rather than inherited from the host. It already resolved to
       * `none` through inheritance — measured, clicks at the invisible chip's own coordinates land
       * on the card behind it — but that depended on an ancestor nobody editing this file can see,
       * and the sibling scroll box next to it sets `auto`. One class makes the intent local.
       *
       * Hidden by position rather than by `sr-only`: that utility also zeroes padding and height,
       * and Tailwind emits its `not-sr-only` counterpart *after* `px-2` and `h-5`, so restoring the
       * chip would have stripped its own shape. Checked, not assumed.
       */
      className="pointer-events-none absolute flex h-5 shrink-0 items-center gap-1.5 rounded-lg bg-[#151515]/30 px-2 text-[0.75rem] leading-[1.0625rem] text-white opacity-0 backdrop-blur-[44px] transition-colors after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] hover:bg-[#151515]/50 focus-visible:pointer-events-auto focus-visible:relative focus-visible:opacity-100 no-hover:pointer-events-auto no-hover:relative no-hover:opacity-100"
    >
      <InfoSmall color="white" />
      <span className="tabular-nums">{expanded ? 'Hide' : `${count} ${count === 1 ? 'claim' : 'claims'}`}</span>
    </button>
  );
}

/**
 * The card's top line: who said it, how the crowd has answered it, and the two ways to answer.
 *
 * `PositionRow` is not reused here, and the reason is size rather than taste: it is a container
 * query that stacks its two pills vertically below ~230px, which is exactly the width this card
 * wants to be. Reusing it would force the card wide enough to cover the face it sits beside. What
 * matters is shared underneath — `useClaimResponseState` and `useClaimPositionControl` resolve the
 * vocabulary and publish the response, so a factual claim still reads Verify/Dispute here and the
 * share is the same number the claim page prints.
 *
 * The crowd split is shown up front, per the Figma card. It is worth knowing that this cuts against
 * the usual argument for withholding it — a viewer who sees "65% agree" before answering is being
 * nudged, and the tally becomes partly a measure of itself. Drawn as designed because it is a
 * deliberate call about what the card is *for*: a running read of the room rather than a poll.
 */
function TickerClaimHeader({
  claimId,
  spaceId,
  speaker,
  row,
  entity,
  onAnswered,
}: {
  claimId: string;
  spaceId: string;
  speaker: DebateParticipant | null;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string, position: boolean | null) => void;
}) {
  const { responseKind, summary, control } = useDebateClaimResponse({ claimId, spaceId, row, entity });
  const openProfile = useOpenDebaterProfile(speaker);

  const position = control.viewerPosition;

  /**
   * Reported on every change, including back to nothing.
   *
   * It used to latch on the first non-null side, which made the map a record of what the viewer
   * *first* pressed rather than what they hold: switch from Agree to Disagree, or clear the side
   * entirely, and the map kept the original. The end-of-debate scorecard reads this to decide which
   * claims to skip and how to tally them, so a stale entry there is the viewer's own answer
   * misreported back to them.
   *
   * Safe to fire on mount, when there is no position and nothing to say: `onAnswered` returns the
   * same map when nothing changes, so React bails out rather than re-rendering every card.
   */
  React.useEffect(() => {
    onAnswered(claimId, position);
  }, [position, claimId, onAnswered]);

  const copy = ENTITY_RESPONSE_COPY[responseKind];
  // Null on a claim nobody has answered, which is most of them — and a genuine 0% is a different
  // statement from "no responses", so the share drops out rather than printing a zero.
  const percent = summary.percent;

  return (
    <div className="flex items-center justify-between gap-2">
      {/* `text-box` trimmed, as the frame has it, and on each text node rather than on the row.
          The trim acts on a box's own line boxes, and these are flex items with their own; the
          frame gives this line a 7px box in a 16px row, which is its cap height. Trimmed, the row
          is the avatar's 16px and the words centre against it. Untrimmed, each 17px line box sets
          the row instead and the card comes out a pixel taller than the frame draws. Per node and
          not via a child selector, because the name now sits inside a button. */}
      <span className="flex min-w-0 items-center gap-1.5 text-[0.75rem] leading-[1.0625rem] text-white">
        {speaker && (
          // The same link as the name in the corner of the tile, and the same person — a reader
          // looking at who said this should be able to go and look at them from here.
          <button
            type="button"
            onClick={openProfile}
            title={`Open ${speakerLabel(speaker)}`}
            className="flex min-w-0 items-center gap-1.5 text-left hover:underline"
          >
            <span className="block size-4 shrink-0 overflow-hidden rounded-full bg-white">
              <Avatar avatarUrl={speaker.avatar_cid} value={speaker.profile_space_id} size={16} />
            </span>
            <span className="truncate [text-box:trim-both_cap_alphabetic]">{speakerLabel(speaker)}</span>
          </button>
        )}
        {percent !== null && (
          <>
            {speaker && (
              <span aria-hidden className="[text-box:trim-both_cap_alphabetic]">
                ·
              </span>
            )}
            {/* Same wording as the verdict on the claim page — "65% agree", or "65% verify" on a
                factual claim, so the share reads the same wherever it is printed. */}
            <span className="shrink-0 tabular-nums [text-box:trim-both_cap_alphabetic]">
              {percent}% {copy.positiveAction.toLowerCase()}
            </span>
          </>
        )}
      </span>
      {/* 4px apart rather than the Figma card's 12px: those are bare 12px glyphs and these are
          20px buttons, so the same gap between glyph *centres* needs a smaller gap between boxes.
          No error text here — it would make the card grow while the reader is part-way through it. */}
      <span className="flex shrink-0 items-center gap-1">
        <ClaimIconButton
          responseKind={responseKind}
          position
          label={copy.positiveAction}
          selected={control.viewerPosition === true}
          disabled={!control.canRespond}
          title={control.actionTitle(true) || copy.positiveAction}
          onClick={() => control.respond(true)}
        />
        <ClaimIconButton
          responseKind={responseKind}
          position={false}
          label={copy.negativeAction}
          selected={control.viewerPosition === false}
          disabled={!control.canRespond}
          title={control.actionTitle(false) || copy.negativeAction}
          onClick={() => control.respond(false)}
        />
      </span>
    </div>
  );
}

/**
 * One side of the answer, as an icon rather than a labelled pill.
 *
 * A labelled button turns the line into a form. An icon keeps the line a line — the reader takes
 * in what was said, and the affordance is there in the corner of their eye if they feel strongly
 * about it. The label survives as the accessible name and the tooltip, so nothing is lost to
 * anyone reading it aloud or hovering.
 *
 * Thumbs for a stance claim, chevrons for a factual one, which is the split the rest of the app
 * already draws: agreeing with a position and verifying a fact are different acts, and a thumb on
 * "the SEC sued Coinbase" reads as approval rather than confirmation.
 */
function ClaimIconButton({
  responseKind,
  position,
  label,
  selected,
  disabled,
  title,
  onClick,
}: {
  responseKind: 'stance' | 'veracity' | 'curation';
  position: boolean;
  label: string;
  selected: boolean;
  disabled: boolean;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={title}
      disabled={disabled}
      onClick={
        onClick &&
        (event => {
          event.stopPropagation();
          onClick();
        })
      }
      className={cx(
        // 20px of target around a 12px glyph, but `-my-0.5` so the extra 4px grows into the card's
        // padding instead of the header row. The frame's row is the avatar's 16px, and a button
        // that sets the row taller pushes the whole card past the 97px the frame draws.
        //
        // 28px on a touch screen, by the same trick: a 20px target is comfortable under a cursor
        // and small under a thumb. The negative margin absorbs all of the growth, so the row stays
        // 16px and the card stays 97px on both.
        '-my-0.5 grid size-5 place-items-center rounded-sm transition-colors disabled:cursor-default md:-my-1.5 md:size-7',
        // Recessive until it matters: dim at rest, brighter on hover, and unmistakable once the
        // reader has actually taken a side.
        selected
          ? position
            ? 'bg-white/15 text-green'
            : 'bg-white/15 text-red-01'
          : 'text-white/55 hover:bg-white/15 hover:text-white disabled:hover:bg-transparent disabled:hover:text-white/55'
      )}
    >
      {/* A veracity chevron has no filled form to switch to, so its selected state is the
          background and colour above rather than the glyph. See `ResponsePositionIcon`. */}
      <ResponsePositionIcon responseKind={responseKind} position={position} selected={selected} />
    </button>
  );
}

/**
 * How wide a marker's hit area may grow, in px.
 *
 * WCAG 2.5.8 asks for 24×24 and the hash is 2×10, so the target needed to grow. Height is free —
 * nothing else is stacked above or below a marker — but width is not, for two separate reasons, and
 * both were measured rather than guessed.
 *
 * **Neighbours.** Markers sit where claims end, and claims cluster. Across the 37 corpus debates
 * with two or more markers, 34% of adjacent pairs are closer than 24px on a phone-width track. A
 * flat 24px target would cover the next claim a third of the time, so a tap would jump to the wrong
 * one — trading an accessibility problem for a correctness one. Each target is therefore clamped to
 * the distance to its nearest neighbour, so two can touch but never overlap.
 *
 * **The scrubber underneath.** These sit above the range input so a click reaches them at all, so
 * whatever they cover is a place a drag cannot start. At 24px that is a mean 18.5% of the track and
 * 60% on the densest debate; at 12px it is 10.4% and 44%. 12 keeps the bulk of the bar draggable
 * and is still a six-fold target, and the height does the rest of the work.
 */
const MARKER_HIT_WIDTH_PX = 12;
/** Full 24px vertically, which costs nothing: the row is 20px and nothing else wants that band. */
const MARKER_HIT_HEIGHT = 'h-6';

/**
 * How wide marker `index`'s hit area may be, as a CSS length.
 *
 * Its own function because the rule is arithmetic rather than styling, and because a test cannot
 * read it off the DOM: jsdom's CSS parser drops `clamp()` outright, so `style.width` comes back
 * empty there whatever we set.
 *
 * `markers` is sorted by `atMs`, and `fraction` is `atMs / timelineMs`, so it is sorted by
 * `fraction` too — the neighbours are the entries either side. A marker alone on the bar has no
 * neighbour to crowd and takes the full width.
 *
 * The `clamp` floor keeps a target at least as wide as the hash it draws. Two claims can end on the
 * same millisecond, and a zero-width button cannot be pressed or focused at all.
 */
export function markerHitWidth(markers: ClaimMarker[], index: number): string {
  const before = index > 0 ? markers[index].fraction - markers[index - 1].fraction : Infinity;
  const after = index < markers.length - 1 ? markers[index + 1].fraction - markers[index].fraction : Infinity;
  const nearest = Math.min(before, after);

  if (!Number.isFinite(nearest)) return `${MARKER_HIT_WIDTH_PX}px`;
  return `clamp(2px, ${(nearest * 100).toFixed(3)}%, ${MARKER_HIT_WIDTH_PX}px)`;
}

/** Claim markers on the scrubber, each a place the viewer can jump to. */
export function ClaimScrubberMarkers({
  markers,
  onSeek,
  className,
}: {
  markers: ClaimMarker[];
  onSeek: (ms: number) => void;
  className?: string;
}) {
  if (markers.length === 0) return null;

  return (
    <div className={cx('pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2', className)}>
      {markers.map((marker, index) => {
        // Several claims can finish in one segment and share a hash. Saying so beats announcing one
        // of them and silently standing for the others. `marker.text` is the one the card will show
        // — not the first of the group — so both the label and the preview name what a click
        // surfaces.
        const preview = marker.count > 1 ? `${marker.text} (+${marker.count - 1} more)` : marker.text;

        return (
          <Tooltip
            key={marker.id}
            position="top"
            // A `title` did this before, and the browser's own wait — a second or more, and not
            // ours to shorten — was long enough that the preview read as broken. A hash is 12px
            // wide at most: nobody rests a pointer on one by accident, so there is nothing for a
            // delay to protect against and the preview opens on arrival.
            delayDuration={0}
            label={preview}
            trigger={
              <button
                type="button"
                aria-label={
                  marker.count > 1
                    ? `Jump to ${marker.count} claims, showing: ${marker.text}`
                    : `Jump to: ${marker.text}`
                }
                onClick={event => {
                  event.stopPropagation();
                  onSeek(marker.seekMs);
                }}
                style={{ left: `${marker.fraction * 100}%`, width: markerHitWidth(markers, index) }}
                // The button is the target and draws nothing; `before:` draws the 2px hash at its
                // centre, so the hash stays 2px however wide the target around it grows.
                className={cx(
                  'pointer-events-auto absolute top-1/2 -translate-x-1/2 -translate-y-1/2 bg-transparent',
                  MARKER_HIT_HEIGHT,
                  'before:absolute before:top-1/2 before:left-1/2 before:h-2.5 before:w-0.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-white/80 before:transition-[height,background-color] before:content-[""]',
                  'hover:before:h-3.5 hover:before:bg-white',
                  // A control in the tab order has to show where focus is; there was nothing before.
                  'focus-visible:outline-none focus-visible:before:h-3.5 focus-visible:before:bg-white'
                )}
              />
            }
          />
        );
      })}
    </div>
  );
}
