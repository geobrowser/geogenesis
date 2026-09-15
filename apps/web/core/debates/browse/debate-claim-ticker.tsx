'use client';

import * as React from 'react';

import cx from 'classnames';

import { ClaimSummary } from '~/core/claims/browse/claim-summary';
import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { Debate, DebateClaim } from '~/core/debates/api';
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

import { Text } from '~/design-system/text';

export type DebateTicker = {
  /**
   * The cards to draw over each debater right now, oldest first, keyed by participant slot.
   *
   * Split by slot because a card belongs over the person who said it: the corner it sits in is
   * their corner, above their name.
   */
  stacks: Map<number, StackedCard[]>;
  /** Every precisely-placed claim, for the scrubber. */
  markers: ClaimMarker[];
  /** Claims in the order they were said, for the card at the end. */
  claims: TimedClaim[];
  /** Claim ids the viewer has answered this session. */
  answered: ReadonlySet<string>;
  onAnswered: (claimId: string) => void;
  onDismiss: (claimId: string) => void;
  /** Per-claim lookups, hoisted so the card and the end-of-debate stack share one batch. */
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  /** Claim id → the debater who said it, for the card's "Ana just said". */
  speakerByClaimId: Map<string, string>;
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

  const [answered, setAnswered] = React.useState<ReadonlySet<string>>(() => new Set());
  const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(() => new Set());

  const onAnswered = React.useCallback((claimId: string) => {
    setAnswered(current => new Set(current).add(claimId));
    setDismissed(current => new Set(current).add(claimId));
  }, []);

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
  const { speakerByClaimId, slotByClaimId } = React.useMemo(() => {
    const bySpace = new Map<string, { label: string; slot: number }>();
    for (const participant of orderedParticipants(debate)) {
      bySpace.set(uuidToHex(participant.profile_space_id), {
        label: speakerLabel(participant),
        slot: participant.participant_slot,
      });
    }

    const byBlock = new Map<string, { label: string; slot: number }>();
    for (const block of claims.blocks) {
      const speaker = block.authorSpaceId ? bySpace.get(uuidToHex(block.authorSpaceId)) : undefined;
      if (speaker) byBlock.set(block.id, speaker);
    }

    const labels = new Map<string, string>();
    const slots = new Map<string, number>();
    for (const claim of claims.all) {
      const speaker = byBlock.get(claim.blockId);
      if (!speaker) continue;
      labels.set(claim.id, speaker.label);
      slots.set(claim.id, speaker.slot);
    }
    return { speakerByClaimId: labels, slotByClaimId: slots };
  }, [claims.all, claims.blocks, debate]);

  // One stack per debater. A claim whose speaker could not be resolved — attribution and the
  // participant list can disagree — is left out rather than parked over whichever tile: putting a
  // claim over the wrong face is the misquote this whole layer is careful about.
  const stacks = React.useMemo(() => {
    const bySlot = new Map<number, StackedCard[]>();
    if (!enabled) return bySlot;

    for (const card of tickerStack(windows, playheadMs, dismissed)) {
      const slot = slotByClaimId.get(card.window.claim.id);
      if (slot === undefined) continue;
      const existing = bySlot.get(slot);
      if (existing) existing.push(card);
      else bySlot.set(slot, [card]);
    }
    return bySlot;
  }, [enabled, windows, playheadMs, dismissed, slotByClaimId]);

  return {
    stacks,
    markers,
    claims: timedClaims,
    answered,
    onAnswered,
    onDismiss,
    rowsByClaimId,
    entitiesByClaimId,
    speakerByClaimId,
  };
}

/**
 * The claim card that rises over the video as it is said.
 *
 * Sits in the seam between the two tiles, which is the one strip of the player that is never a
 * face. One card at a time, dismissible, and it never pauses the video or opens a dialog — the
 * only thing that interrupts playback is the sign-in prompt, which is the app's standard prompt
 * and only appears if the viewer presses a pill while signed out.
 */
export function DebateClaimTickerCard({
  window,
  opacity = 1,
  row,
  entity,
  onAnswered,
}: {
  window: TickerWindow;
  /** Driven by the playhead, so a scrub lands on the right strength rather than mid-animation. */
  opacity?: number;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string) => void;
}) {
  const { claim } = window;

  if (!claim.spaceId) return null;

  return (
    <div
      // The video behind is one big play/pause button; without this every pill press would also
      // toggle playback.
      onClick={event => event.stopPropagation()}
      style={{ opacity }}
      className="pointer-events-auto w-full rounded-md bg-white/95 px-2.5 py-2 shadow-card backdrop-blur-[2px]"
    >
      <p className="text-footnote leading-snug text-text">{claim.text}</p>
      <TickerClaimControls
        claimId={claim.id}
        spaceId={claim.spaceId}
        row={row}
        entity={entity}
        onAnswered={onAnswered}
      />
    </div>
  );
}

/**
 * The stack of claim cards over one debater, oldest at the top.
 *
 * Anchored above the name in the corner rather than centred over the video: a card in the middle
 * reads as a dialog demanding an answer, and it covers the face of the person making the argument.
 * Here it behaves like a chat — the newest arrives at the bottom, earlier ones ride up and fade.
 */
export function DebateClaimTickerStack({
  cards,
  rowsByClaimId,
  entitiesByClaimId,
  onAnswered,
}: {
  cards: StackedCard[];
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  onAnswered: (claimId: string) => void;
}) {
  if (cards.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-10 left-4 z-10 flex w-[min(20rem,62%)] flex-col gap-1.5">
      {cards.map(card => (
        <DebateClaimTickerCard
          key={card.window.claim.id}
          window={card.window}
          opacity={card.opacity}
          row={rowsByClaimId.get(card.window.claim.id) ?? null}
          entity={entitiesByClaimId.get(card.window.claim.id) ?? null}
          onAnswered={onAnswered}
        />
      ))}
    </div>
  );
}


/**
 * The same control logic and the same publish path as every other claim surface, drawn small.
 *
 * `PositionRow` is not reused here, and the reason is size rather than taste: it is a container
 * query that stacks its two pills vertically below ~230px, which is exactly the width this card
 * wants to be. Reusing it would force the card wide enough to cover the face it sits beside. What
 * matters is shared underneath — `useClaimPositionControl` publishes the response, and the labels
 * come from the same vocabulary table, so a factual claim still reads Verify/Dispute here.
 *
 * The crowd split is deliberately withheld until the viewer has answered. Showing it first biases
 * the answer and makes the tally a measure of itself; withholding it also gives the tap a payoff.
 */
function TickerClaimControls({
  claimId,
  spaceId,
  row,
  entity,
  onAnswered,
}: {
  claimId: string;
  spaceId: string;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string) => void;
}) {
  const promptSignIn = usePrivySignIn();
  const {
    responseKind,
    isResponseKindResolved,
    isViewerResponseResolved,
    responseBlockedReason,
    summary,
    claim,
    positions,
    readiness,
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

  const answered = control.viewerPosition !== null;

  // Reported once, on the transition. The card stays up for the rest of its window so the viewer
  // sees the split they just earned; it is the *next* seek past it that will skip it.
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (answered && !reported.current) {
      reported.current = true;
      onAnswered(claimId);
    }
  }, [answered, claimId, onAnswered]);

  const copy = ENTITY_RESPONSE_COPY[responseKind];

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1.5">
        <CompactPill
          label={copy.positiveAction}
          selected={control.viewerPosition === true}
          disabled={!control.canRespond}
          title={control.actionTitle(true)}
          tone="positive"
          onClick={() => control.respond(true)}
        />
        <CompactPill
          label={copy.negativeAction}
          selected={control.viewerPosition === false}
          disabled={!control.canRespond}
          title={control.actionTitle(false)}
          tone="negative"
          onClick={() => control.respond(false)}
        />
      </div>
      {control.responseError ? (
        <div role="alert" className="mt-1.5">
          <Text as="p" variant="footnote" color="red-01">
            {control.responseError}
          </Text>
        </div>
      ) : null}
      {answered && !summary.isLoading ? (
        <ClaimSummary
          entityId={claimId}
          spaceId={spaceId}
          responseKind={responseKind}
          summary={summary}
          className="mt-2"
        />
      ) : null}
    </div>
  );
}

/**
 * One side of the answer, sized for a card that sits beside a face rather than over it.
 *
 * Deliberately plain: no responder avatars, no percentage. Those belong on a row the reader is
 * studying, and here they would be three more things moving in the corner of a playing video.
 */
function CompactPill({
  label,
  selected,
  disabled,
  title,
  tone,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  title: string;
  tone: 'positive' | 'negative';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title || undefined}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'flex-1 rounded-sm border px-2 py-1 text-footnote font-medium transition-colors disabled:cursor-default disabled:opacity-60',
        selected
          ? tone === 'positive'
            ? 'border-green bg-successTertiary text-text'
            : 'border-red-01 bg-errorTertiary text-text'
          : 'border-grey-02 bg-white text-grey-04 hover:border-grey-03 hover:text-text'
      )}
    >
      {label}
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
