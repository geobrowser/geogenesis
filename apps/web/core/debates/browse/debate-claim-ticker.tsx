'use client';

import * as React from 'react';

import cx from 'classnames';

import { ActionSurface, ActionSurfaceDiv } from '~/core/action-context-provider';
import type { Debate, DebateClaim, DebateParticipant } from '~/core/debates/api';
import {
  type ClaimMarker,
  type StackedCard,
  type TickerWindow,
  backlogWindows,
  claimHistory,
  claimMarkers,
} from '~/core/debates/claim-ticker';
import { useDebateClaimsBySpaces } from '~/core/debates/hooks';
import { speakerLabel } from '~/core/debates/playback-utils';
import { useDrawableDebateClaims } from '~/core/debates/use-drawable-debate-claims';
import { CLAIM_RESPONSE_COPY, type ResponseKind } from '~/core/responses/entity-response';
import type { Entity } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';
import { Tooltip } from '~/design-system/tooltip';

import { useLineClampOverflow } from './line-clamp-overflow';
import { useDebateClaimResponse } from './use-debate-claim-response';
import { useOpenDebaterProfile } from './use-open-debater-profile';

type DebateTicker = {
  /**
   * Every claim each debater has said so far, oldest first, keyed by the participant slot that said
   * them — what their counter counts and opens into.
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
  const {
    transcript: { claims },
    claims: drawable,
    speakerByClaimId: participantByClaimId,
    entitiesByClaimId,
  } = useDrawableDebateClaims(debate, enabled);

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
  const renderableClaims = React.useMemo(() => (enabled ? drawable : []), [enabled, drawable]);

  // Markers assert a moment; the backlog only says "already said" — see `backlogWindows`.
  const backlog = React.useMemo(() => backlogWindows(renderableClaims), [renderableClaims]);
  const markers = React.useMemo(() => claimMarkers(renderableClaims, timelineMs), [renderableClaims, timelineMs]);

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

  // One list per debater, under their own tile. A claim whose speaker could not be resolved —
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

  const backlogBySlot = React.useMemo(() => groupBySlot(backlog), [groupBySlot, backlog]);

  const historyBySlot = React.useMemo(() => {
    const history = new Map<number, StackedCard[]>();
    for (const [slot, slotWindows] of backlogBySlot) history.set(slot, claimHistory(slotWindows, playheadMs));
    return history;
  }, [backlogBySlot, playheadMs]);

  return {
    historyBySlot,
    markers,
    answers,
    onAnswered,
    rowsByClaimId,
    entitiesByClaimId,
  };
}

/** `glass` over the video; `light` on a white surface, as the end card's carousel is. */
export type ClaimCardTone = 'glass' | 'light';

/**
 * The claim card that rises over the video as it is said.
 *
 * A translucent dark card in the player's bottom-right corner, stacked upward: the newest arrives
 * at the bottom and earlier ones ride up and dissolve, which is the shape of a chat rather than a
 * dialog. It never pauses the video or opens anything — the only thing that interrupts playback is
 * the sign-in prompt, which is the app's standard prompt and only appears if the viewer presses a
 * thumb while signed out.
 */
export function DebateClaimTickerCard(props: Parameters<typeof DebateClaimTickerCardBody>[0]) {
  if (!props.window.claim.spaceId) return null;
  return (
    <ActionSurface
      asChild
      trackImpression={props.opacity === undefined || props.opacity > 0}
      value={{ component: 'debate_claim_ticker', target_id: props.window.claim.id, target_type: 'claim' }}
    >
      <DebateClaimTickerCardBody {...props} />
    </ActionSurface>
  );
}

function DebateClaimTickerCardBody({
  window,
  opacity = 1,
  speaker = null,
  row,
  entity,
  onAnswered,
  tone = 'glass',
}: {
  window: TickerWindow;
  /**
   * `glass` over the video, as it rises while the claim is said. `light` on a white surface — the
   * debate end card's carousel — where the dark glass would be white text on near-white.
   */
  tone?: ClaimCardTone;
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
    <ActionSurfaceDiv
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
       */
      className={cx(
        'pointer-events-auto flex w-full shrink-0 flex-col gap-1.5 rounded-lg p-3',
        tone === 'glass' ? 'bg-[#151515]/30 backdrop-blur-[44px]' : 'bg-grey-01'
      )}
    >
      <TickerClaimHeader
        claimId={claim.id}
        spaceId={claim.spaceId}
        speaker={speaker}
        row={row}
        entity={entity}
        onAnswered={onAnswered}
        tone={tone}
      />
      {/* A flex column, so the text — or the expand toggle wrapping it — stays a blockified flex
          item exactly as it was before this wrapper existed. In a plain block box the toggle is an
          inline-level `<button>`, which sits on a line box of its own and adds the strut's 7px
          under every truncated claim in the wide backlog. */}
      <div className="relative flex flex-col">
        <TickerClaimText text={claim.text} tone={tone} />
      </div>
    </ActionSurfaceDiv>
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
function TickerClaimText({ text, tone }: { text: string; tone: ClaimCardTone }) {
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
        'text-[1rem] leading-[1.0625rem] tracking-[-0.16px]',
        tone === 'glass' ? 'text-white' : 'text-text',
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
 * The card's top line: who said it, how the crowd has answered it, and the two ways to answer.
 *
 * `PositionRow` is not reused here, and the reason is size rather than taste: it is a container
 * query that stacks its two pills vertically below ~230px, which is exactly the width this card
 * wants to be. Reusing it would force the card wide enough to cover the face it sits beside. What
 * matters is shared underneath — `useClaimResponseState` and `useClaimPositionControl` resolve the
 * response and publish it, so the share is the same number the claim page prints.
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
  tone,
}: {
  claimId: string;
  spaceId: string;
  speaker: DebateParticipant | null;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string, position: boolean | null) => void;
  tone: ClaimCardTone;
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

  const copy = CLAIM_RESPONSE_COPY;
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
      <span
        className={cx(
          'flex min-w-0 items-center gap-1.5 text-[0.75rem] leading-[1.0625rem]',
          tone === 'glass' ? 'text-white' : 'text-grey-04'
        )}
      >
        {speaker && (
          // The same link as the name in the corner of the tile, and the same person — a reader
          // looking at who said this should be able to go and look at them from here.
          <button
            type="button"
            onClick={openProfile}
            title={`Open ${speakerLabel(speaker)}`}
            className="flex min-w-0 items-center gap-1.5 text-left hover:underline"
          >
            <span
              className={cx(
                'block size-4 shrink-0 overflow-hidden rounded-full',
                tone === 'glass' ? 'bg-white' : 'bg-grey-02'
              )}
            >
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
            {/* Same wording as the verdict on the claim page — "65% agree" — so the share reads
                the same wherever it is printed. */}
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
          tone={tone}
        />
        <ClaimIconButton
          responseKind={responseKind}
          position={false}
          label={copy.negativeAction}
          selected={control.viewerPosition === false}
          disabled={!control.canRespond}
          title={control.actionTitle(false) || copy.negativeAction}
          onClick={() => control.respond(false)}
          tone={tone}
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
 * Thumbs, on every claim. A factual one used to draw chevrons here, because verifying a fact and
 * agreeing with a position were different acts; claims ask one question now, so there is one
 * glyph.
 *
 * `column` is the Open rounds claim list's vote column (GEO-3317): a round 24px target sized to the
 * player, with a solid glyph that reads at that size, coloured once the reader takes a side.
 */
export function ClaimIconButton({
  responseKind,
  position,
  label,
  selected,
  disabled,
  title,
  onClick,
  tone,
  layout = 'inline',
}: {
  responseKind: ResponseKind;
  position: boolean;
  label: string;
  selected: boolean;
  disabled: boolean;
  title: string;
  onClick?: () => void;
  tone: ClaimCardTone;
  layout?: 'inline' | 'column';
}) {
  const glass = tone === 'glass';
  const column = layout === 'column';
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
        'grid place-items-center transition-colors disabled:cursor-default',
        column
          ? // 6cqw, overlapping the column's gaps, and never under 24px.
            '-my-[1cqw] size-[6cqw] min-h-6 min-w-6 rounded-full [&>svg]:size-[3.6cqw]'
          : '-my-0.5 size-5 rounded-sm md:-my-1.5 md:size-7',
        // Recessive until it matters: dim at rest, brighter on hover, and unmistakable once the
        // reader has actually taken a side.
        selected
          ? cx(glass ? 'bg-white/15' : 'bg-divider', position ? 'text-green' : 'text-red-01')
          : glass
            ? 'text-white/55 hover:bg-white/15 hover:text-white disabled:hover:bg-transparent disabled:hover:text-white/55'
            : 'text-grey-04 hover:bg-divider hover:text-text disabled:hover:bg-transparent disabled:hover:text-grey-04'
      )}
    >
      <ResponsePositionIcon responseKind={responseKind} position={position} selected={selected || column} />
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
        // — not the first of the group — so both strings name what a click surfaces.
        const alsoHere = marker.count - 1;
        const preview = alsoHere > 0 ? `${marker.text} (+${alsoHere} more)` : marker.text;
        const label =
          alsoHere > 0 ? `Jump to ${marker.count} claims, showing: ${marker.text}` : `Jump to: ${marker.text}`;

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
                aria-label={label}
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
