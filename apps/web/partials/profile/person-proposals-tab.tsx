'use client';

import * as React from 'react';

import { proposalTimestampSeconds } from '~/core/governance/proposal-timestamp';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { type PersonProposal, usePersonProposals } from '~/core/profile/use-person-proposals';
import type { Profile } from '~/core/types';
import { NavUtils, getProposalName } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SpacePillAvatar } from '~/design-system/space-pill';

import { GovernanceProposalRow } from '~/partials/governance/governance-proposal-row';

/**
 * Everything this person proposed, newest first (GEO-2859).
 *
 * The same row the governance tab draws — `GovernanceProposalRow` is shared, not
 * reimplemented — with the space added above the title, because this list spans
 * every space the person proposed into and which one a change landed in is the
 * first thing that distinguishes one row from the next.
 */
export function PersonProposalsTab({ spaceId, proposer }: { spaceId: string; proposer: Profile }) {
  const [cursors, setCursors] = React.useState<(string | null)[]>([null]);
  const after = cursors[cursors.length - 1];

  const { page, isLoading, isPlaceholderData } = usePersonProposals({ spaceId, after });

  // Looked up once for the page. These are routinely spaces the viewer has never
  // opened, which the browse sidebar cannot name.
  const rowSpaceIds = React.useMemo(
    () => [...new Set(page.proposals.map(proposal => proposal.spaceId))],
    [page.proposals]
  );
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  if (isLoading && page.proposals.length === 0) {
    return <p className="py-6 text-body text-grey-04">Loading proposals…</p>;
  }

  if (page.proposals.length === 0) {
    return <p className="py-6 text-body text-grey-04">No proposals yet</p>;
  }

  const showPager = cursors.length > 1 || (page.hasNextPage && page.endCursor !== null);

  return (
    <div className="flex flex-col">
      {page.proposals.map(proposal => (
        <ProposalRow
          key={proposal.id}
          proposal={proposal}
          proposer={proposer}
          label={spaceLabel(labelsById, proposal.spaceId)}
          returnSpaceId={spaceId}
        />
      ))}

      {showPager && (
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            disabled={cursors.length === 1 || isPlaceholderData}
            onClick={() => setCursors(previous => previous.slice(0, -1))}
            className="text-metadata text-ctaPrimary disabled:text-grey-03"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!page.hasNextPage || page.endCursor === null || isPlaceholderData}
            onClick={() => page.endCursor && setCursors(previous => [...previous, page.endCursor])}
            className="text-metadata text-ctaPrimary disabled:text-grey-03"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function percentageFromCounts(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.floor((count / total) * 100);
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
