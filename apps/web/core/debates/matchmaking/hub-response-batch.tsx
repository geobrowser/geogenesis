'use client';

import * as React from 'react';

import {
  ClaimResponseBatchBoundary,
  useClaimResponseSummaryBatch,
} from '~/core/responses/use-claim-response-summaries';

import type { DebateResponseKind } from '../api';

export type HubResponseTarget = {
  spaceId: string;
  entityId: string;
  responseKind: DebateResponseKind;
};

/**
 * Response summaries are fetched per space, but the hub's lists are cross-space — so run one batch
 * per distinct space and only declare the boundary ready once they all are. Without this each card
 * would fetch its own summary, which is dozens of requests for a single page of claims.
 */
export function HubResponseBatch({ targets, children }: { targets: HubResponseTarget[]; children: React.ReactNode }) {
  const bySpace = React.useMemo(() => {
    const grouped = new Map<string, { entityId: string; responseKind: DebateResponseKind }[]>();
    for (const target of targets) {
      const existing = grouped.get(target.spaceId);
      const entry = { entityId: target.entityId, responseKind: target.responseKind };
      if (existing) existing.push(entry);
      else grouped.set(target.spaceId, [entry]);
    }
    return [...grouped.entries()];
  }, [targets]);

  const [status, setStatus] = React.useState<Record<string, 'loading' | 'ready' | 'error'>>({});
  const report = React.useCallback((spaceId: string, next: 'loading' | 'ready' | 'error') => {
    setStatus(current => (current[spaceId] === next ? current : { ...current, [spaceId]: next }));
  }, []);

  const spaceIds = bySpace.map(([spaceId]) => spaceId);
  const failed = spaceIds.some(spaceId => status[spaceId] === 'error');
  const ready = bySpace.length === 0 || spaceIds.every(spaceId => status[spaceId] === 'ready');

  const batches = bySpace.map(([spaceId, spaceTargets]) => (
    <SpaceResponseBatch key={spaceId} spaceId={spaceId} targets={spaceTargets} onStatus={report} />
  ));

  // A card inside the boundary never fetches for itself, so a failed batch would leave every card
  // showing empty counts. Dropping the boundary instead lets each card fall back to its own fetch.
  if (failed) {
    return (
      <>
        {batches}
        {children}
      </>
    );
  }

  return (
    <>
      {batches}
      <ClaimResponseBatchBoundary ready={ready}>{children}</ClaimResponseBatchBoundary>
    </>
  );
}

/** Renders nothing — it exists to run one space's batch query and report where it got to. */
function SpaceResponseBatch({
  spaceId,
  targets,
  onStatus,
}: {
  spaceId: string;
  targets: { entityId: string; responseKind: DebateResponseKind }[];
  onStatus: (spaceId: string, status: 'loading' | 'ready' | 'error') => void;
}) {
  const batch = useClaimResponseSummaryBatch({ spaceId, targets, enabled: targets.length > 0 });
  const status = batch.isError ? 'error' : targets.length === 0 || batch.isSuccess ? 'ready' : 'loading';

  React.useEffect(() => {
    onStatus(spaceId, status);
  }, [onStatus, spaceId, status]);

  return null;
}
