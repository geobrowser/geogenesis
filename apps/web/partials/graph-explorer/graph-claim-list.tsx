'use client';

import * as React from 'react';

import {
  ClaimResponseBatchBoundary,
  useClaimResponseSummaryBatch,
} from '~/core/responses/use-claim-response-summaries';

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
export function useClaimSpaceBatches(
  claims: ReadonlyArray<{ id: string; spaceId: string }>,
  { responderMetadata = true }: { responderMetadata?: boolean } = {}
) {
  const [status, setStatus] = React.useState<Record<string, ClaimBatchStatus>>({});
  const onStatus = React.useCallback(
    (spaceId: string, value: ClaimBatchStatus) =>
      setStatus(current => (current[spaceId] === value ? current : { ...current, [spaceId]: value })),
    []
  );
  const bySpace = new Map<string, string[]>();
  for (const claim of claims) bySpace.set(claim.spaceId, [...(bySpace.get(claim.spaceId) ?? []), claim.id]);
  const batches = [...bySpace].map(([spaceId, claimIds]) => (
    <SpaceBatch
      key={spaceId}
      spaceId={spaceId}
      claimIds={claimIds}
      responderMetadata={responderMetadata}
      onStatus={onStatus}
    />
  ));
  return { status, batches };
}

function SpaceBatch({
  spaceId,
  claimIds,
  responderMetadata,
  onStatus,
}: {
  spaceId: string;
  claimIds: string[];
  responderMetadata: boolean;
  onStatus: (spaceId: string, status: ClaimBatchStatus) => void;
}) {
  const key = claimIds.join(',');
  const targets = React.useMemo(
    () => key.split(',').map(entityId => ({ entityId, responseKind: 'stance' as const })),
    [key]
  );
  const batch = useClaimResponseSummaryBatch({ spaceId, targets, enabled: true, responderMetadata });
  const status: ClaimBatchStatus = batch.isError
    ? 'failed'
    : batch.isSuccess && !batch.isPlaceholderData
      ? 'ready'
      : 'pending';
  React.useEffect(() => onStatus(spaceId, status), [onStatus, status, spaceId]);
  return null;
}
