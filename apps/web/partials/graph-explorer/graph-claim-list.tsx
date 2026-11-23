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
  const { status, batches } = useClaimSpaceBatches(claims);
  return (
    <>
      {batches}
      {claims.map(claim => (
        <ClaimBatchRow key={claim.id} status={status[claim.spaceId] ?? 'pending'}>
          <GraphClaimRow claim={claim} />
        </ClaimBatchRow>
      ))}
    </>
  );
}

export type ClaimBatchStatus = 'pending' | 'ready' | 'failed';

/**
 * Wraps a claim's controls in its space's batch. After a failed batch the boundary is dropped, so
 * the row reads its own counts and held side instead of voting against an unknown one.
 */
export function ClaimBatchRow({ status, children }: { status: ClaimBatchStatus; children: React.ReactNode }) {
  if (status === 'failed') return <>{children}</>;
  return <ClaimResponseBatchBoundary ready={status === 'ready'}>{children}</ClaimResponseBatchBoundary>;
}

/** One response batch per claim space; `batches` must be rendered for them to run. */
export function useClaimSpaceBatches(claims: ReadonlyArray<{ id: string; spaceId: string }>) {
  const [status, setStatus] = React.useState<Record<string, ClaimBatchStatus>>({});
  const onStatus = React.useCallback(
    (spaceId: string, value: ClaimBatchStatus) =>
      setStatus(current => (current[spaceId] === value ? current : { ...current, [spaceId]: value })),
    []
  );
  const bySpace = new Map<string, string[]>();
  for (const claim of claims) bySpace.set(claim.spaceId, [...(bySpace.get(claim.spaceId) ?? []), claim.id]);
  const batches = [...bySpace].map(([spaceId, claimIds]) => (
    <SpaceBatch key={spaceId} spaceId={spaceId} claimIds={claimIds} onStatus={onStatus} />
  ));
  return { status, batches };
}

function SpaceBatch({
  spaceId,
  claimIds,
  onStatus,
}: {
  spaceId: string;
  claimIds: string[];
  onStatus: (spaceId: string, status: ClaimBatchStatus) => void;
}) {
  const key = claimIds.join(',');
  const targets = React.useMemo(
    () => key.split(',').map(entityId => ({ entityId, responseKind: 'stance' as const })),
    [key]
  );
  const batch = useClaimResponseSummaryBatch({ spaceId, targets, enabled: true });
  const status: ClaimBatchStatus = batch.isError
    ? 'failed'
    : batch.isSuccess && !batch.isPlaceholderData
      ? 'ready'
      : 'pending';
  React.useEffect(() => onStatus(spaceId, status), [onStatus, status, spaceId]);
  return null;
}
