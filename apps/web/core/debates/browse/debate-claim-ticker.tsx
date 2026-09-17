'use client';

import * as React from 'react';

import cx from 'classnames';

import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { Debate, DebateClaim, DebateParticipant } from '~/core/debates/api';
import {
  type ClaimMarker,
  type StackedCard,
  type TickerWindow,
  claimMarkers,
  tickerStack,
  tickerWindows,
} from '~/core/debates/claim-ticker';
import { type TimedClaim, claimsInSpokenOrder } from '~/core/debates/claim-timing';
import { useDebateClaimsBySpaces } from '~/core/debates/hooks';
import { useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { uuidToHex } from '~/core/id/normalize';
import { ENTITY_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { ChevronDown } from '~/design-system/icons/chevron-down';
import { ChevronUp } from '~/design-system/icons/chevron-up';
import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';

export type DebateTicker = {
  /**
   * The cards to draw over the video right now, oldest first.
   *
   * One stack for the whole player rather than one per debater. The card carries the speaker's
   * avatar and name itself now, so it no longer has to sit over their tile to say who is talking —
   * which frees it to live in a single fixed corner and read as a feed of what is being said.
   */
  cards: StackedCard[];
  /** Every precisely-placed claim, for the scrubber. */
  markers: ClaimMarker[];
  /** Claims in the order they were said, for the card at the end. */
  claims: TimedClaim[];
  /** Claim ids the viewer has answered this session. */
  answered: ReadonlySet<string>;
  /** Which way they answered each one, for the tally at the end. */
  answers: ReadonlyMap<string, boolean>;
  onAnswered: (claimId: string, position: boolean) => void;
  onDismiss: (claimId: string) => void;
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
export function useDebateClaimTicker(debate: Debate, playheadMs: number, enabled: boolean): DebateTicker {
  const { claims } = useDebateTranscriptClaims(debate.id, debate.claim.space_id, enabled);
  const { timings } = useClaimTimings(debate.id, claims, enabled);

  const [answers, setAnswers] = React.useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(() => new Set());

  const onAnswered = React.useCallback((claimId: string, position: boolean) => {
    setAnswers(current => new Map(current).set(claimId, position));
    setDismissed(current => new Set(current).add(claimId));
  }, []);

  // The ids alone, for every caller that only asks "has this been answered".
  const answered = React.useMemo(() => new Set(answers.keys()), [answers]);

  const onDismiss = React.useCallback((claimId: string) => {
    setDismissed(current => new Set(current).add(claimId));
  }, []);

  const timedClaims = React.useMemo(() => claimsInSpokenOrder(claims.all, timings), [claims.all, timings]);
  const windows = React.useMemo(() => tickerWindows(timedClaims), [timedClaims]);

  // The debate's own length rather than the video element's: the two recordings are composited
  // against the debate timeline, which is what the scrubber measures.
  const durationMs = React.useMemo(
    () => claims.all.reduce((longest, claim) => Math.max(longest, timings.get(claim.id)?.endMs ?? 0), 0),
    [claims.all, timings]
  );
  const markers = React.useMemo(() => claimMarkers(timedClaims, durationMs), [timedClaims, durationMs]);

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

  // One stack for the whole player. A claim whose speaker could not be resolved — attribution and
  // the participant list can disagree — is left out rather than drawn anonymously: the card now
  // puts a name and a face against the sentence, and putting the wrong one there is the misquote
  // this whole layer is careful about.
  const cards = React.useMemo(() => {
    if (!enabled) return [];
    return tickerStack(windows, playheadMs, dismissed).filter(card =>
      participantByClaimId.has(card.window.claim.id)
    );
  }, [enabled, windows, playheadMs, dismissed, participantByClaimId]);

  return {
    cards,
    markers,
    claims: timedClaims,
    answered,
    answers,
    onAnswered,
    onDismiss,
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
 */
const OLDER_CARD_FADE = 'linear-gradient(to bottom, transparent 6%, #000 89%)';

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
      className="pointer-events-auto flex w-full flex-col gap-1.5 rounded-lg bg-[#151515]/30 p-3"
    >
      <TickerClaimHeader
        claimId={claim.id}
        spaceId={claim.spaceId}
        speaker={speaker}
        row={row}
        entity={entity}
        onAnswered={onAnswered}
      />
      {/* Three lines and then an ellipsis. A claim that runs long is a claim the viewer can read in
          full in the panel; letting the card grow to fit it would cover the face saying it. */}
      <p className="line-clamp-3 text-[1rem] leading-[1.0625rem] tracking-[-0.16px] text-white">{claim.text}</p>
    </div>
  );
}

/**
 * The stack of claim cards in the player's bottom-left corner, oldest at the top.
 *
 * Anchored in the corner rather than centred over the video: a card in the middle reads as a
 * dialog demanding an answer, and it covers the face of the person making the argument.
 */
export function DebateClaimTickerStack({
  cards,
  participantByClaimId,
  rowsByClaimId,
  entitiesByClaimId,
  onAnswered,
}: {
  cards: StackedCard[];
  participantByClaimId?: Map<string, DebateParticipant>;
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  onAnswered: (claimId: string, position: boolean) => void;
}) {
  if (cards.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {cards.map((card, index) => (
        <DebateClaimTickerCard
          key={card.window.claim.id}
          window={card.window}
          opacity={card.opacity}
          // Everything but the last, which is the newest and sits at full strength.
          fading={index < cards.length - 1}
          speaker={participantByClaimId?.get(card.window.claim.id) ?? null}
          row={rowsByClaimId.get(card.window.claim.id) ?? null}
          entity={entitiesByClaimId.get(card.window.claim.id) ?? null}
          onAnswered={onAnswered}
        />
      ))}
    </div>
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
  const promptSignIn = usePrivySignIn();
  const {
    responseKind,
    isResponseKindResolved,
    isViewerResponseResolved,
    responseBlockedReason,
    claim,
    positions,
    readiness,
    summary,
  } = useClaimResponseState({ claimId, spaceId, row, entity });

  const control = useClaimPositionControl({
    claim,
    positions,
    readiness,
    answersReady: isResponseKindResolved && isViewerResponseResolved,
    responseBlockedReason,
    onRequireSignIn: promptSignIn,
    // Same reason the panel passes false: the viewer is already watching this debate, so offering
    // them another one is the wrong invitation at the wrong moment.
    offersDebate: false,
  });

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
export function ClaimIconButton({
  responseKind,
  position,
  label,
  selected,
  disabled,
  title,
  surface = 'video',
  size = 'sm',
  onClick,
}: {
  responseKind: 'stance' | 'veracity' | 'curation';
  position: boolean;
  label: string;
  selected: boolean;
  disabled: boolean;
  title: string;
  /** `video` sits on the dark scrim over a frame; `card` on white. */
  surface?: 'video' | 'card';
  size?: 'sm' | 'md';
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
        'grid place-items-center rounded-sm transition-colors disabled:cursor-default',
        size === 'md' ? 'size-8' : 'size-5',
        // Recessive until it matters: dim at rest, brighter on hover, and unmistakable once the
        // reader has actually taken a side.
        surface === 'video'
          ? selected
            ? position
              ? 'bg-white/15 text-green'
              : 'bg-white/15 text-red-01'
            : 'text-white/55 hover:bg-white/15 hover:text-white disabled:hover:bg-transparent disabled:hover:text-white/55'
          : selected
            ? position
              ? 'bg-successTertiary text-green'
              : 'bg-errorTertiary text-red-01'
            : 'text-grey-04 hover:bg-grey-01 hover:text-text disabled:hover:bg-transparent disabled:hover:text-grey-04'
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
