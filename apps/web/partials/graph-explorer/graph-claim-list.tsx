'use client';

import * as React from 'react';

import type { ClaimAbout } from '~/core/graph-explorer/claims-about';
import {
  ClaimResponseBatchBoundary,
  useClaimResponseSummaryBatch,
} from '~/core/responses/use-claim-response-summaries';

import { GraphClaimRow } from './graph-claim-row';

/**
 * Claims about the centre, with their response counts loaded in one batch per page and claim space
 * rather than per row. A page is its own batch so loading more never resets rows already shown.
 */
export function GraphClaimList({ pages }: { pages: ClaimAbout[][] }) {
  return (
    <ul className="flex flex-col gap-2">
      {pages.map((claims, index) => (
        <ClaimPage key={index} claims={claims} />
      ))}
    </ul>
  );
}

function ClaimPage({ claims }: { claims: ClaimAbout[] }) {
  const spaceIds = React.useMemo(() => [...new Set(claims.map(claim => claim.spaceId))], [claims]);
  const [ready, setReady] = React.useState<Record<string, boolean>>({});
  const onReady = React.useCallback(
    (spaceId: string, value: boolean) =>
      setReady(current => (current[spaceId] === value ? current : { ...current, [spaceId]: value })),
    []
  );

  return (
    <>
      {spaceIds.map(spaceId => (
        <SpaceBatch
          key={spaceId}
          spaceId={spaceId}
          claimIds={claims.filter(claim => claim.spaceId === spaceId).map(claim => claim.id)}
          onReady={onReady}
        />
      ))}
      {claims.map(claim => (
        <ClaimResponseBatchBoundary key={claim.id} ready={ready[claim.spaceId] ?? false}>
          <GraphClaimRow claim={claim} />
        </ClaimResponseBatchBoundary>
      ))}
    </>
  );
}

/** A failed batch counts as settled, so rows say "Responses unavailable" rather than load forever. */
function SpaceBatch({
  spaceId,
  claimIds,
  onReady,
}: {
  spaceId: string;
  claimIds: string[];
  onReady: (spaceId: string, ready: boolean) => void;
}) {
  const targets = React.useMemo(
    () => claimIds.map(entityId => ({ entityId, responseKind: 'stance' as const })),
    [claimIds]
  );
  const batch = useClaimResponseSummaryBatch({ spaceId, targets, enabled: true });
  const settled = (batch.isSuccess && !batch.isPlaceholderData) || batch.isError;
  React.useEffect(() => onReady(spaceId, settled), [onReady, settled, spaceId]);
  return null;
}
