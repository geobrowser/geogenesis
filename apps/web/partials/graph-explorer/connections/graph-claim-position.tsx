'use client';

import * as React from 'react';

import { GREY_SURFACE_RING_STYLE } from '~/core/claims/browse/claim-summary';
import { DebateClaimControls } from '~/core/debates/browse/debate-claim-controls';
import { useDebateClaimResponse } from '~/core/debates/browse/use-debate-claim-response';
import { votesLabel } from '~/core/graph-explorer/panel-sections';
import { useQueryEntities } from '~/core/sync/use-store';

/**
 * The open claim's split and its labeled Agree / Disagree, at the top of the graph explorer's side
 * panel (GEO-3841). The same pills and split the claim page and debate cards draw, so a side taken
 * here shows on all of them.
 *
 * Signed out, a press is kept on this device and the save sheet asks for an account, as the thumbs
 * on the panel's claim rows do (GEO-3214).
 */
export function GraphClaimPosition({ claimId, spaceId }: { claimId: string; spaceId: string }) {
  // The claim on the graph: geo-chat has no row for most spaces the map reaches, and without one of
  // the two the response kind never resolves and the pills stay disabled.
  const { entities } = useQueryEntities({ where: { id: { in: [claimId] } }, first: 1 });
  const response = useDebateClaimResponse({
    claimId,
    spaceId,
    row: null,
    entity: entities[0] ?? null,
    // The thumbs these replace, and the panel's claim rows, ask on the feed's schedule.
    savePromptSurface: 'feed',
  });

  return (
    // The box is grey, so the split's responder faces ring in grey rather than white, as the inline
    // split does on the debate card's grey footer.
    <div className="flex flex-col gap-3" style={GREY_SURFACE_RING_STYLE}>
      <DebateClaimControls
        claimId={claimId}
        spaceId={spaceId}
        response={response}
        analyticsSurface="graph-explorer"
        // The split reads first, then the buttons that change it.
        summaryLayout="stacked"
        summaryPlacement="before"
        // The panel has always said how many voted ("71% agree · 7 votes"), and the count moves with
        // a press: the summary counts the viewer's side optimistically.
        summaryDetail={votesLabel(response.summary.total)}
      />
    </div>
  );
}
