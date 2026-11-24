'use client';

import * as React from 'react';

import { useClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { ClaimSplitBar } from '~/core/claims/browse/claim-summary';
import type { ClaimAbout } from '~/core/graph-explorer/claims-about';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

/**
 * One group's share of a claim's responses. Not built yet: the product has not defined
 * communities. The row accepts it so a split can be added without changing callers.
 */
export type ClaimResponseBreakdownRow = { label: string; agreePercent: number; total: number };

/** Read and voted in the claim's own space (`claim.spaceId`), which is often not the topic's. */
export function GraphClaimRow({
  claim,
  breakdown: _breakdown,
}: {
  claim: ClaimAbout;
  breakdown?: ClaimResponseBreakdownRow[];
}) {
  const summary = useClaimResponseSummary(claim.id, claim.spaceId, 'stance');

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-grey-02 p-3">
      <Link
        href={NavUtils.toEntity(claim.spaceId, claim.id)}
        className="text-body text-text transition-colors hover:text-grey-04"
      >
        {claim.name}
      </Link>
      <div className="flex items-center justify-between gap-3">
        <AgreementBar summary={summary} />
        <EntityVoteButtons entityId={claim.id} spaceId={claim.spaceId} responseKind="stance" hideEmptyClaimShare />
      </div>
    </li>
  );
}

/** The share itself is on the vote control; this adds the split and the count, or says there is none. */
function AgreementBar({ summary }: { summary: ReturnType<typeof useClaimResponseSummary> }) {
  if (!summary.hasCounts) {
    return summary.isLoading ? (
      <Skeleton className="h-4 w-32 rounded" />
    ) : (
      <span className="text-metadata text-grey-04">Responses unavailable</span>
    );
  }

  if (summary.total === 0) return <span className="text-metadata text-grey-04">No responses yet</span>;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <ClaimSplitBar percent={summary.percent ?? 0} className="h-1.5 max-w-[160px] min-w-[80px] flex-1" />
      <span className="shrink-0 text-metadata text-grey-04 tabular-nums">
        {summary.total} {summary.total === 1 ? 'response' : 'responses'}
      </span>
    </div>
  );
}
