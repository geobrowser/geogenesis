'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate, DebateClaim } from '~/core/debates/api';
import { type ClaimMarker, claimMarkers } from '~/core/debates/claim-ticker';
import { type TimedClaim, claimsInSpokenOrder } from '~/core/debates/claim-timing';
import { useDebateClaimsBySpaces } from '~/core/debates/hooks';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { uuidToHex } from '~/core/id/normalize';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';


export type DebateTicker = {
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
export function useDebateClaimTicker(debate: Debate, enabled: boolean): DebateTicker {
  const { claims } = useDebateTranscriptClaims(debate.id, debate.claim.space_id, enabled);
  const { timings } = useClaimTimings(debate.id, claims, enabled);

  const [answers, setAnswers] = React.useState<ReadonlyMap<string, boolean>>(() => new Map());
  const onAnswered = React.useCallback((claimId: string, position: boolean) => {
    setAnswers(current => new Map(current).set(claimId, position));
  }, []);

  // The ids alone, for every caller that only asks "has this been answered".
  const answered = React.useMemo(() => new Set(answers.keys()), [answers]);


  const timedClaims = React.useMemo(() => claimsInSpokenOrder(claims.all, timings), [claims.all, timings]);

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
    const bySpace = new Map<string, { label: string }>();
    for (const participant of orderedParticipants(debate)) {
      bySpace.set(uuidToHex(participant.profile_space_id), { label: speakerLabel(participant) });
    }

    const byBlock = new Map<string, { label: string }>();
    for (const block of claims.blocks) {
      const speaker = block.authorSpaceId ? bySpace.get(uuidToHex(block.authorSpaceId)) : undefined;
      if (speaker) byBlock.set(block.id, speaker);
    }

    const labels = new Map<string, string>();
    for (const claim of claims.all) {
      const speaker = byBlock.get(claim.blockId);
      if (speaker) labels.set(claim.id, speaker.label);
    }
    return labels;
  }, [claims.all, claims.blocks, debate]);

  return {
    markers,
    claims: timedClaims,
    answered,
    answers,
    onAnswered,
    rowsByClaimId,
    entitiesByClaimId,
    speakerByClaimId,
  };
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
