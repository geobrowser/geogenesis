'use client';

import * as React from 'react';

import { ClaimSplitBar } from '~/core/claims/browse/claim-summary';
import { DebateClaimControls } from '~/core/debates/browse/debate-claim-controls';
import { useDebateClaimResponse } from '~/core/debates/browse/use-debate-claim-response';
import { votesLabel } from '~/core/graph-explorer/panel-sections';
import { CLAIM_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';

import { Text } from '~/design-system/text';

/**
 * The open claim's split and its labeled Agree / Disagree, at the top of the graph explorer's side
 * panel (GEO-3841), laid out as the map panel in the Gaza prototype: the share and the vote count on
 * one line, a thin black-on-grey bar, then two equal outlined pills.
 *
 * Its own split over the same hook and `DebateClaimControls` the debate surfaces use, so a side taken
 * here shows on all of them, while those surfaces keep their green/red split and dashed pills.
 *
 * Signed out, a press is kept on this device and the save sheet asks for an account, as the thumbs
 * on the panel's claim rows do (GEO-3214); "Not counted yet · Save" sits under the pill pressed.
 */
export function GraphClaimPosition({ claimId, spaceId }: { claimId: string; spaceId: string }) {
  // The claim on the graph: geo-chat has no row for most spaces the map reaches, and without one of
  // the two the response kind never resolves and the pills stay disabled.
  const { entities } = useQueryEntities({ where: { id: { in: [claimId] } }, first: 1 });
  const { responseKind, summary, control } = useDebateClaimResponse({
    claimId,
    spaceId,
    row: null,
    entity: entities[0] ?? null,
    // The thumbs these replace, and the panel's claim rows, ask on the feed's schedule.
    savePromptSurface: 'feed',
  });

  return (
    <div className="flex flex-col gap-2">
      {/* Nothing until the counts answer: a failed count is not "No votes yet". */}
      {!summary.isLoading && summary.hasCounts ? (
        <GraphClaimSplit total={summary.total} percent={summary.percent} />
      ) : null}
      <DebateClaimControls
        claimId={claimId}
        spaceId={spaceId}
        response={{ responseKind, summary, control }}
        // The prototype's panel has no faces in its pills.
        showParticipants={false}
        outline="solid"
        analyticsSurface="graph-explorer"
        className="mt-1"
      />
    </div>
  );
}

/**
 * "50% agree" and "3,829 votes" on one line over a black-on-grey bar. From the first vote on, as
 * `ClaimSummary` does; with none, "No votes yet" and no bar, since an empty bar reads as 0% agree.
 */
export function GraphClaimSplit({ total, percent }: { total: number; percent: number | null }) {
  const copy = CLAIM_RESPONSE_COPY;
  const agree = copy.positiveAction.toLowerCase();

  if (total === 0 || percent === null) {
    return (
      <Text as="p" variant="metadata" color="grey-04">
        No votes yet
      </Text>
    );
  }

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[20px] font-semibold text-text tabular-nums">{percent}%</span>{' '}
          <span className="text-[14px] text-grey-04">{agree}</span>
        </p>
        <span className="text-browseSection leading-4 text-mute tabular-nums">{votesLabel(total)}</span>
      </div>
      <ClaimSplitBar percent={percent} tone="mono" className="h-1.5" />
    </>
  );
}
