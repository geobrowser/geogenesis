'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate, DebateClaim, DebateParticipant } from '~/core/debates/api';
import {
  type ClaimMarker,
  type StackedCard,
  type TickerWindow,
  claimHistory,
  claimMarkers,
  tickerStack,
  tickerWindows,
} from '~/core/debates/claim-ticker';
import { type TimedClaim, claimsInSpokenOrder } from '~/core/debates/claim-timing';
import { useDebateClaimsBySpaces } from '~/core/debates/hooks';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { uuidToHex } from '~/core/id/normalize';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { ChevronDown } from '~/design-system/icons/chevron-down';
import { ChevronUp } from '~/design-system/icons/chevron-up';
import { InfoSmall } from '~/design-system/icons/info-small';
import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';

import { useLineClampOverflow } from './line-clamp-overflow';
import { useDebateClaimResponse } from './use-debate-claim-response';

export type DebateTicker = {
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
  /** Claims in the order they were said, for the card at the end. */
  claims: TimedClaim[];
  /** Claim ids the viewer has answered this session. */
  answered: ReadonlySet<string>;
  /** Which way they answered each one, for the tally at the end. */
  answers: ReadonlyMap<string, boolean>;
  onAnswered: (claimId: string, position: boolean) => void;
  /** Per-claim lookups, hoisted so the card and the end-of-debate stack share one batch. */
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  /** Claim id → the debater's display label, for the card at the end. */
  speakerByClaimId: Map<string, string>;
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
  const onAnswered = React.useCallback((claimId: string, position: boolean) => {
    setAnswers(current => new Map(current).set(claimId, position));
  }, []);

  // The ids alone, for every caller that only asks "has this been answered".
  const answered = React.useMemo(() => new Set(answers.keys()), [answers]);

  const timedClaims = React.useMemo(() => claimsInSpokenOrder(claims.all, timings), [claims.all, timings]);
  const windows = React.useMemo(() => tickerWindows(timedClaims), [timedClaims]);

  const markers = React.useMemo(() => claimMarkers(timedClaims, timelineMs), [timedClaims, timelineMs]);

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

  const rowGroups = React.useMemo(() => {
    const bySpace = new Map<string, string[]>();
    for (const claim of claims.all) {
      if (!claim.spaceId) continue;
      const ids = bySpace.get(claim.spaceId);
      if (ids) ids.push(claim.id);
      else bySpace.set(claim.spaceId, [claim.id]);
    }
    return [...bySpace].map(([spaceId, ids]) => ({ spaceId, claimIds: ids }));
  }, [claims.all]);

  const rowsQuery = useDebateClaimsBySpaces(rowGroups);
  const rowsByClaimId = React.useMemo(() => {
    const map = new Map<string, DebateClaim>();
    for (const row of rowsQuery.claims) map.set(row.claim_entity_id, row);
    return map;
  }, [rowsQuery.claims]);

  // Attribution rides the *block*, not the claim: a claim's own space is the debate's publication
  // space, which both debaters share. The block's `Authors` relation points at the speaker's
  // personal space, which is the id the participant list keys on.
  const { speakerByClaimId, participantByClaimId } = React.useMemo(() => {
    const bySpace = new Map<string, DebateParticipant>();
    for (const participant of orderedParticipants(debate)) {
      bySpace.set(uuidToHex(participant.profile_space_id), participant);
    }

    const byBlock = new Map<string, DebateParticipant>();
    for (const block of claims.blocks) {
      const speaker = block.authorSpaceId ? bySpace.get(uuidToHex(block.authorSpaceId)) : undefined;
      if (speaker) byBlock.set(block.id, speaker);
    }

    const labels = new Map<string, string>();
    const speakers = new Map<string, DebateParticipant>();
    for (const claim of claims.all) {
      const speaker = byBlock.get(claim.blockId);
      if (!speaker) continue;
      labels.set(claim.id, speakerLabel(speaker));
      speakers.set(claim.id, speaker);
    }
    return { speakerByClaimId: labels, participantByClaimId: speakers };
  }, [claims.all, claims.blocks, debate]);

  // One stack per debater, over their own tile. A claim whose speaker could not be resolved —
  // attribution and the participant list can disagree — is left out rather than parked over
  // whichever half: putting a claim over the wrong face is the misquote this whole layer is
  // careful about, and now that the corner itself attributes, getting it wrong is louder.
  const windowsBySlot = React.useMemo(() => {
    const bySlot = new Map<number, TickerWindow[]>();
    if (!enabled) return bySlot;

    for (const window of windows) {
      const slot = participantByClaimId.get(window.claim.id)?.participant_slot;
      if (slot === undefined) continue;
      const existing = bySlot.get(slot);
      if (existing) existing.push(window);
      else bySlot.set(slot, [window]);
    }
    return bySlot;
  }, [enabled, windows, participantByClaimId]);

  const { cardsBySlot, historyBySlot } = React.useMemo(() => {
    const cards = new Map<number, StackedCard[]>();
    const history = new Map<number, StackedCard[]>();
    for (const [slot, slotWindows] of windowsBySlot) {
      cards.set(slot, tickerStack(slotWindows, playheadMs));
      history.set(slot, claimHistory(slotWindows, playheadMs));
    }
    return { cardsBySlot: cards, historyBySlot: history };
  }, [windowsBySlot, playheadMs]);

  return {
    cardsBySlot,
    historyBySlot,
    markers,
    claims: timedClaims,
    answered,
    answers,
    onAnswered,
    rowsByClaimId,
    entitiesByClaimId,
    speakerByClaimId,
    participantByClaimId,
  };
}

/**
 * The ramp the card above the newest one wears as it ages out.
 *
 * Figma draws this as one 209×168 alpha gradient over the whole stack region — transparent at the
 * top, fully opaque 71.5px down — with the cards sliding up through it. Reproduced per-card rather
 * than as a mask on a fixed-height box, because that box would have to stay 168px at every player
 * width and the player is responsive. With the stack capped at two (`MAX_STACKED_CARDS`) the
 * arithmetic comes out the same: the newest card sits entirely inside the opaque zone, so the card
 * above it is the only one carrying any of the ramp.
 *
 * Measured up from the card's own bottom rather than as a fraction of its height. How far the
 * resting stack reaches up the video is a physical distance on screen, and a fraction is not one:
 * Figma's older card is two lines where a real claim is often three, so the same percentages
 * stretch the ramp over a taller card and leave the whole of it legible — the stack then climbs
 * most of the tile. Pinned in rem, a long claim fades sooner rather than reaching further.
 *
 * The bottom line stays crisp; everything above it is gone within about two more.
 */
const OLDER_CARD_FADE = 'linear-gradient(to top, #000 0, #000 1rem, transparent 3.25rem)';

/**
 * The same dissolve on the top edge of the open list.
 *
 * Without it the backlog is cut off square at the tile's edge — a half a card with a hard line
 * through it, which reads as broken rather than as more-above. Applied to the scroll box rather
 * than to a card, so it stays put at the edge while the list moves under it, and the card crossing
 * it fades on the way out exactly as the live stack's does.
 *
 * Only while something is actually scrolled above. A short backlog sits wholly inside the box with
 * nothing cut off, and fading its first card then would be dimming the top of a list for no reason.
 */
const HISTORY_EDGE_FADE = 'linear-gradient(to bottom, transparent 0, #000 4.25rem)';

/**
 * The claim card that rises over the video as it is said.
 *
 * A translucent dark card in the player's bottom-left corner, stacked upward: the newest arrives
 * at the bottom and earlier ones ride up and dissolve, which is the shape of a chat rather than a
 * dialog. It never pauses the video or opens anything — the only thing that interrupts playback is
 * the sign-in prompt, which is the app's standard prompt and only appears if the viewer presses a
 * thumb while signed out.
 */
export function DebateClaimTickerCard({
  window,
  opacity = 1,
  fading = false,
  speaker = null,
  row,
  entity,
  onAnswered,
}: {
  window: TickerWindow;
  /** Driven by the playhead, so a scrub lands on the right strength rather than mid-animation. */
  opacity?: number;
  /** True for a card that has another below it — the one the stack's gradient dissolves. */
  fading?: boolean;
  /** Who said it. The card names them, so it no longer has to sit over their tile to attribute. */
  speaker?: DebateParticipant | null;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string, position: boolean) => void;
}) {
  const { claim } = window;

  if (!claim.spaceId) return null;

  return (
    <div
      // The video behind is one big play/pause button; without this every tap on a thumb would
      // also toggle playback.
      onClick={event => event.stopPropagation()}
      style={{
        opacity,
        ...(fading ? { maskImage: OLDER_CARD_FADE, WebkitMaskImage: OLDER_CARD_FADE } : null),
      }}
      className="pointer-events-auto flex w-full flex-col gap-1.5 rounded-lg bg-[#151515]/30 p-3 backdrop-blur-md"
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

/** Three lines of a claim before the card would start covering the face saying it. */
const TICKER_CLAMP_LINES = 3;

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
        expanded ? 'block' : 'line-clamp-3'
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
 * The claim cards in the player's bottom-left corner, oldest at the top.
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
  onAnswered: (claimId: string, position: boolean) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  /** Whether anything is scrolled off the top, which is the only time the edge needs dissolving. */
  const [scrolledDown, setScrolledDown] = React.useState(false);

  const shown = open ? (history ?? cards) : cards;

  const syncScrolled = React.useCallback(() => {
    const element = scrollRef.current;
    setScrolledDown(element !== null && element.scrollTop > 1);
  }, []);

  // Opened at the bottom, on the most recent claim — scrolling *up* from there is the "go back
  // through it" this exists for. Re-run as the history grows so a claim arriving while the list is
  // open does not leave the view stranded mid-list.
  React.useEffect(() => {
    const element = scrollRef.current;
    if (!open || !element) {
      setScrolledDown(false);
      return;
    }
    element.scrollTop = element.scrollHeight;
    syncScrolled();
  }, [open, shown.length, syncScrolled]);

  const backlog = history ?? cards;

  // Closed with nothing live — which is most of a debate. The chip is the only thing on screen
  // saying the backlog exists at all, and on a touch screen it is the only way to reach it: there
  // is no hover, and the video behind is one large play/pause button, so the corner cannot quietly
  // swallow a tap to mean something else.
  if (shown.length === 0) {
    if (open || backlog.length === 0 || !onTogglePinned) return null;
    return <ClaimBacklogChip count={backlog.length} expanded={false} onClick={onTogglePinned} />;
  }

  return (
    <div className="flex min-h-0 w-full flex-col items-start gap-1.5">
      <div
        ref={scrollRef}
        onScroll={syncScrolled}
        style={
          open && scrolledDown ? { maskImage: HISTORY_EDGE_FADE, WebkitMaskImage: HISTORY_EDGE_FADE } : undefined
        }
        onFocus={() => onFocusChange?.(true)}
        // Only when focus leaves the stack entirely — moving between two cards inside it must not
        // collapse the list out from under the keyboard.
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocusChange?.(false);
        }}
        className={cx(
          'pointer-events-auto flex w-full flex-col gap-1.5',
          // The host caps the height — see the note on it — so this only has to be allowed to
          // shrink inside that cap and scroll what does not fit.
          open && 'no-scrollbar min-h-0 overflow-y-auto'
        )}
      >
        {shown.map((card, index) => (
          <DebateClaimTickerCard
            key={card.window.claim.id}
            window={card.window}
            opacity={card.opacity}
            // Only the live stack dissolves its older card. In the open list every claim is one the
            // reader chose to look at, so fading any of them would just make it hard to read.
            fading={!open && index < shown.length - 1}
            speaker={participantByClaimId?.get(card.window.claim.id) ?? null}
            row={rowsByClaimId.get(card.window.claim.id) ?? null}
            entity={entitiesByClaimId.get(card.window.claim.id) ?? null}
            onAnswered={onAnswered}
          />
        ))}
      </div>

      {/* Only where the chip is what opened it. A pointer closes by leaving the tile; a tap has
          nowhere to go, so the way in has to double as the way out. */}
      {open && pinned && onTogglePinned && (
        <ClaimBacklogChip count={backlog.length} expanded onClick={onTogglePinned} />
      )}
    </div>
  );
}

/**
 * The corner's resting state, and the only part of this layer that is always there to be found.
 *
 * The backlog was reachable by hover alone, which is nothing on a touch screen and close to nothing
 * on a desktop — a viewer only finds an invisible affordance by accident. One small pill fixes both:
 * it says the claims exist, says how many, and is a tap target where there is no pointer.
 *
 * Deliberately the same glyph the Claims button in the interaction bar uses, because it opens the
 * same set of claims. Two different icons for one idea would be the harder thing to learn.
 */
function ClaimBacklogChip({
  count,
  expanded,
  onClick,
}: {
  count: number;
  expanded: boolean;
  onClick: () => void;
}) {
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
      className="pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-[#151515]/30 px-2 py-1.5 text-[0.75rem] leading-[1.0625rem] text-white backdrop-blur-md transition-colors hover:bg-[#151515]/50"
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
  onAnswered: (claimId: string, position: boolean) => void;
}) {
  const { responseKind, summary, control } = useDebateClaimResponse({ claimId, spaceId, row, entity });

  const position = control.viewerPosition;

  // Reported once, on the transition. The card stays up for the rest of its window so the viewer
  // sees the side they just took; it is the *next* seek past it that will skip it.
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (position !== null && !reported.current) {
      reported.current = true;
      onAnswered(claimId, position);
    }
  }, [position, claimId, onAnswered]);

  const copy = ENTITY_RESPONSE_COPY[responseKind];
  // Null on a claim nobody has answered, which is most of them — and a genuine 0% is a different
  // statement from "no responses", so the share drops out rather than printing a zero.
  const percent = summary.percent;

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 text-[0.75rem] leading-[1.0625rem] text-white">
        {speaker && (
          <span className="block size-4 shrink-0 overflow-hidden rounded-full bg-white">
            <Avatar avatarUrl={speaker.avatar_cid} value={speaker.profile_space_id} size={16} />
          </span>
        )}
        {speaker && <span className="truncate">{speakerLabel(speaker)}</span>}
        {percent !== null && (
          <>
            {speaker && <span aria-hidden>·</span>}
            {/* Same wording as the verdict on the claim page — "65% agree", or "65% verify" on a
                factual claim, so the share reads the same wherever it is printed. */}
            <span className="shrink-0 tabular-nums">
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
  const Icon = responseKind === 'veracity' ? (position ? ChevronUp : ChevronDown) : position ? ThumbUp : ThumbDown;

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
        'grid size-5 place-items-center rounded-sm transition-colors disabled:cursor-default',
        // Recessive until it matters: dim at rest, brighter on hover, and unmistakable once the
        // reader has actually taken a side.
        selected
          ? position
            ? 'bg-white/15 text-green'
            : 'bg-white/15 text-red-01'
          : 'text-white/55 hover:bg-white/15 hover:text-white disabled:hover:bg-transparent disabled:hover:text-white/55'
      )}
    >
      <Icon filled={selected} />
    </button>
  );
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
      {markers.map(marker => (
        <button
          key={marker.id}
          type="button"
          title={marker.text}
          aria-label={`Jump to: ${marker.text}`}
          onClick={event => {
            event.stopPropagation();
            onSeek(marker.atMs);
          }}
          style={{ left: `${marker.fraction * 100}%` }}
          className="pointer-events-auto absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 transition-[height,background-color] hover:h-3.5 hover:bg-white"
        />
      ))}
    </div>
  );
}
