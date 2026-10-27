'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { drawableClaims, speakersByClaimId } from './claim-ticker';
import { claimsInSpokenOrder } from './claim-timing';
import { useClaimTimings } from './use-claim-timings';
import { useDebateTranscriptClaims } from './use-debate-transcript-claims';

/**
 * A debate's claims as a claim card draws them: in the order they were said, each credited to the
 * debater who said it, with the graph entity its vote control reads.
 *
 * Two surfaces draw these cards — the live ticker over the video, and the end card's carousel — and
 * they have to agree on which claims can be drawn and who said each one. One pipeline, on the same
 * query keys, so the second surface is a cache read of the first and neither can drift from the
 * other.
 *
 * `claims` is every drawable claim; gating it on anything more (the ticker's `enabled`, the
 * carousel's wait for timings) is the caller's, since the two gate differently.
 */
export function useDrawableDebateClaims(debate: Debate, enabled: boolean) {
  const transcript = useDebateTranscriptClaims(debate.id, debate.claim.space_id, enabled);
  const { claims: transcriptClaims } = transcript;
  const { timings, isReady: timingsReady } = useClaimTimings(debate.id, transcriptClaims, enabled);

  const speakerByClaimId = React.useMemo(() => speakersByClaimId(debate, transcriptClaims), [debate, transcriptClaims]);
  const claims = React.useMemo(
    () => drawableClaims(claimsInSpokenOrder(transcriptClaims.all, timings), speakerByClaimId),
    [speakerByClaimId, timings, transcriptClaims.all]
  );

  // One batch for every claim, so no card issues a lookup of its own as it mounts.
  const claimIds = React.useMemo(() => transcriptClaims.all.map(claim => claim.id), [transcriptClaims.all]);
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

  return { transcript, claims, speakerByClaimId, entitiesByClaimId, timingsReady };
}
