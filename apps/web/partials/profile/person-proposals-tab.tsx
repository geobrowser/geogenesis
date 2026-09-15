'use client';

import * as React from 'react';

import Link from 'next/link';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { type PersonProposal, usePersonProposals } from '~/core/profile/use-person-proposals';
import { getProposalName } from '~/core/utils/utils';

import { SpacePillAvatar } from '~/design-system/space-pill';

import { GovernanceStatusChip } from '~/partials/governance/governance-status-chip';

/**
 * Everything this person proposed, newest first (GEO-2859).
 *
 * The space comes first on every row because this list spans all of them — the
 * reference account proposed into 21 — so which space a change landed in is the
 * first thing that distinguishes one row from the next.
 */
export function PersonProposalsTab({ spaceId }: { spaceId: string }) {
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
    return <p className="py-6 text-metadata text-grey-04">Loading proposals…</p>;
  }

  if (page.proposals.length === 0) {
    return <p className="py-6 text-metadata text-grey-04">No proposals yet.</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <ul className="divide-y divide-divider">
        {page.proposals.map(proposal => (
          <li key={proposal.id}>
            <ProposalRow proposal={proposal} label={spaceLabel(labelsById, proposal.spaceId)} />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between">
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
    </section>
  );
}

function ProposalRow({ proposal, label }: { proposal: PersonProposal; label: SpaceLabel | undefined }) {
  // The space's own name where we have it; otherwise an id fragment, which at
  // least tells two unnamed spaces apart where a shared placeholder would not.
  const spaceName = label?.name ?? proposal.spaceId.slice(0, 8);

  // Only an edit carries a name of its own. The rest are named by what they did,
  // which needs the space's name to read as a sentence — so it is resolved here
  // rather than where the proposal was fetched.
  const name = getProposalName({
    name: proposal.name ?? proposal.id,
    type: proposal.type,
    space: { id: proposal.spaceId, name: spaceName, image: label?.image ?? PLACEHOLDER_SPACE_IMAGE },
  });

  return (
    <Link
      href={`/space/${proposal.spaceId}/governance?proposalId=${proposal.id}`}
      className="flex flex-col gap-1 py-3 transition-colors duration-150 hover:bg-divider/40"
    >
      <div className="flex items-center gap-2">
        {label?.image ? <SpacePillAvatar value={label.image} /> : null}
        <span className="text-breadcrumb text-grey-04">{spaceName}</span>
      </div>

      <p className="text-metadataMedium">{name}</p>

      <div className="flex items-center gap-1 text-breadcrumb text-grey-04">
        {/*
         * The same chip the governance list uses, so one proposal reads the same
         * in both places. Read-only here: without `spaceId`/`proposalId` it
         * renders a label rather than an Execute button, which has no business
         * nested inside this row's link.
         */}
        <GovernanceStatusChip status={proposal.status} endTime={proposal.endTime} canExecute={false} />
        <span className="tabular-nums">
          {proposal.yes} for, {proposal.no} against
        </span>
        {proposal.createdAt > 0 && (
          <>
            <span aria-hidden>·</span>
            <time className="tabular-nums" dateTime={new Date(proposal.createdAt * 1000).toISOString()}>
              {formatProposalDate(proposal.createdAt)}
            </time>
          </>
        )}
      </div>
    </Link>
  );
}

/** e.g. 12 Mar 2023. Fixed locale so the server and the client agree. */
export function formatProposalDate(createdAt: number): string {
  return new Date(createdAt * 1000).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
