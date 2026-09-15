'use client';

import * as React from 'react';

import cx from 'classnames';

import { ClaimSummary } from '~/core/claims/browse/claim-summary';
import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { Debate, DebateClaim } from '~/core/debates/api';
import { type ClaimMarker, type TickerWindow, activeTickerClaim, claimMarkers, tickerWindows } from '~/core/debates/claim-ticker';
import { type TimedClaim, claimsInSpokenOrder } from '~/core/debates/claim-timing';
import { useDebateClaimsBySpaces } from '~/core/debates/hooks';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { uuidToHex } from '~/core/id/normalize';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

export type DebateTicker = {
  /** The claim to draw over the video right now, or null. */
  active: TickerWindow | null;
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
  const active = React.useMemo(
    () => (enabled ? activeTickerClaim(windows, playheadMs, dismissed) : null),
    [enabled, windows, playheadMs, dismissed]
  );

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
  const speakerByClaimId = React.useMemo(() => {
    const labelBySpace = new Map<string, string>();
    for (const participant of orderedParticipants(debate)) {
      labelBySpace.set(uuidToHex(participant.profile_space_id), speakerLabel(participant));
    }

    const labelByBlock = new Map<string, string>();
    for (const block of claims.blocks) {
      const label = block.authorSpaceId ? labelBySpace.get(uuidToHex(block.authorSpaceId)) : undefined;
      if (label) labelByBlock.set(block.id, label);
    }

    const byClaim = new Map<string, string>();
    for (const claim of claims.all) {
      const label = labelByBlock.get(claim.blockId);
      if (label) byClaim.set(claim.id, label);
    }
    return byClaim;
  }, [claims.all, claims.blocks, debate]);

  return {
    active,
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
  speaker,
  row,
  entity,
  onAnswered,
  onDismiss,
}: {
  window: TickerWindow;
  speaker: string | null;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string) => void;
  onDismiss: (claimId: string) => void;
}) {
  const { claim } = window;

  if (!claim.spaceId) return null;

  return (
    <div
      // The video behind is one big play/pause button; without this every pill press would also
      // toggle playback.
      onClick={event => event.stopPropagation()}
      className="pointer-events-auto w-full max-w-[26rem] rounded-lg bg-white p-3 shadow-card"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Text as="span" variant="footnote" color="grey-04" className="block">
            {speaker ? `${speaker} just said` : 'Just said'}
          </Text>
          <Text as="p" variant="metadataMedium" color="text" className="mt-1">
            {claim.text}
          </Text>
        </div>
        <button
          type="button"
          aria-label="Dismiss claim"
          onClick={() => onDismiss(claim.id)}
          className="-mt-1 -mr-1 shrink-0 p-1 text-grey-04 transition-colors hover:text-text"
        >
          <Close />
        </button>
      </div>

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
 * The same pills, the same publish path and the same vocabulary as every other claim surface.
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

  return (
    <div className="mt-2">
      <PositionRow
        positions={control.optimisticPositions}
        responseKind={responseKind}
        viewerPosition={control.viewerPosition}
        onRespond={control.respond}
        disabled={!control.canRespond}
        titleFor={control.actionTitle}
      />
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
