'use client';

import * as React from 'react';

import { proposalTimestampSeconds } from '~/core/governance/proposal-timestamp';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { useInfiniteSentinel } from '~/core/profile/use-infinite-sentinel';
import { type PersonProposal, usePersonProposals } from '~/core/profile/use-person-proposals';
import type { Profile } from '~/core/types';
import { NavUtils, getProposalName } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { SpacePillAvatar } from '~/design-system/space-pill';

import { GovernanceProposalRow, percentageFromCounts } from '~/partials/governance/governance-proposal-row';

/**
 * Everything this person proposed, newest first (GEO-2859).
 *
 * The same row the governance tab draws — `GovernanceProposalRow` is shared, not
 * reimplemented — with the space added above the title, because this list spans
 * every space the person proposed into and which one a change landed in is the
 * first thing that distinguishes one row from the next.
 */
export function PersonProposalsTab({ spaceId, proposer }: { spaceId: string; proposer: Profile }) {
  const { proposals, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = usePersonProposals({ spaceId });

  // Looked up once for the page. These are routinely spaces the viewer has never
  // opened, which the browse sidebar cannot name.
  const rowSpaceIds = React.useMemo(() => [...new Set(proposals.map(proposal => proposal.spaceId))], [proposals]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  const sentinelRef = useInfiniteSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage });

  if (isLoading && proposals.length === 0) {
    return <p className="py-6 text-body text-grey-04">Loading proposals…</p>;
  }

  if (proposals.length === 0) {
    return <p className="py-6 text-body text-grey-04">No proposals yet</p>;
  }

  return (
    <div className="flex flex-col">
      {proposals.map(proposal => (
        <ProposalRow
          key={proposal.id}
          proposal={proposal}
          proposer={proposer}
          label={spaceLabel(labelsById, proposal.spaceId)}
          returnSpaceId={spaceId}
        />
      ))}

      {/* Well above the fold, so the next page is already in by the time the
          reader reaches the end — 765 rows on the reference account. */}
      <div ref={sentinelRef} className="h-4 w-full" aria-hidden />

      {isFetchingNextPage && (
        <div className="mt-4 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalRow({
  proposal,
  proposer,
  label,
  returnSpaceId,
}: {
  proposal: PersonProposal;
  proposer: Profile;
  label: SpaceLabel | undefined;
  /** The profile being read, so closing the proposal comes back here. */
  returnSpaceId: string;
}) {
  // The space's own name where we have it; otherwise an id fragment, which at
  // least tells two unnamed spaces apart where a shared placeholder would not.
  const spaceName = label?.name ?? proposal.spaceId.slice(0, 8);

  // Only an edit carries a name of its own. The rest are named by what they did,
  // which needs the space's name to read as a sentence — so it is resolved here
  // rather than where the proposal was fetched.
  const title = getProposalName({
    name: proposal.name ?? proposal.id,
    type: proposal.type,
    space: { id: proposal.spaceId, name: spaceName, image: label?.image ?? '' },
  });

  const total = proposal.yes + proposal.no + proposal.abstain;

  return (
    // The same per-row rule the governance list draws, so the two lists read
    // as one kind of thing.
    <div className="relative border-b border-grey-01">
      {/*
       * `from` and `returnSpaceId` are what bring the reader back here rather
       * than stranding them in the governance tab of a space they were never
       * in — see `useCloseProposal`.
       */}
      <Link
        href={`/space/${proposal.spaceId}/governance?proposalId=${proposal.id}&from=profile&returnSpaceId=${returnSpaceId}`}
        className="absolute inset-0 z-0"
        aria-label={title}
      />
      <GovernanceProposalRow
        title={title}
        profile={proposer}
        timestampSeconds={proposalTimestampSeconds({
          status: proposal.status,
          endTime: proposal.endTime,
          startTime: proposal.startTime,
          submittedAt: proposal.createdAt,
        })}
        yesPercentage={percentageFromCounts(proposal.yes, total)}
        noPercentage={percentageFromCounts(proposal.no, total)}
        status={proposal.status}
        endTime={proposal.endTime}
        // A record is read, not acted on, and the chip's Execute button would be
        // a control nested inside this row's link.
        canExecute={false}
        bylineLead={
          <Link
            href={NavUtils.toSpace(proposal.spaceId)}
            // Above the row's own full-bleed link, which would otherwise
            // swallow the click and send them to the proposal.
            className="relative z-10 flex min-w-0 items-center gap-2 transition-colors duration-75 hover:text-text"
          >
            {label?.image ? <SpacePillAvatar value={label.image} /> : null}
            <span className="min-w-0 truncate">{spaceName}</span>
          </Link>
        }
      />
    </div>
  );
}
