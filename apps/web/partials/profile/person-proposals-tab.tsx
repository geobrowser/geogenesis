'use client';

import * as React from 'react';

import type { HubFilterOption } from '~/core/debates/matchmaking/hub-filter-menu';
import { proposalTimestampSeconds } from '~/core/governance/proposal-timestamp';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { useInfiniteSentinel } from '~/core/profile/use-infinite-sentinel';
import { usePersonProposalSpaces } from '~/core/profile/use-person-proposal-spaces';
import { type PersonProposal, type ProposalSort, usePersonProposals } from '~/core/profile/use-person-proposals';
import type { Profile } from '~/core/types';
import { NavUtils, getProposalName } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { SpacePillAvatar } from '~/design-system/space-pill';

import { GovernanceProposalRow, percentageFromCounts } from '~/partials/governance/governance-proposal-row';

import { PartialLoadError } from './partial-load-error';
import { RecordFilterRow } from './record-filter-row';
import { useRecordSelection } from './use-record-selection';

/**
 * No Top here, and not for want of a connection (GEO-2918).
 *
 * A proposal carries no score, and ranking a governance record by its vote tally
 * would put a contested change above an uncontested one for no reason a reader
 * could name.
 */
const SORT_OPTIONS: HubFilterOption<string>[] = [
  { value: 'new', label: 'New' },
  { value: 'old', label: 'Old' },
];

/**
 * Everything this person proposed, newest first (GEO-2859).
 *
 * The same row the governance tab draws — `GovernanceProposalRow` is shared, not
 * reimplemented — with the space added above the title, because this list spans
 * every space the person proposed into and which one a change landed in is the
 * first thing that distinguishes one row from the next.
 */
export function PersonProposalsTab({ spaceId, proposer }: { spaceId: string; proposer: Profile }) {
  const [sort, setSort] = React.useState<ProposalSort>('new');
  const spaces = useRecordSelection();

  const { proposals, isLoading, isError, isFetchingNextPage, hasNextPage, fetchNextPage } = usePersonProposals({
    spaceId,
    sort,
    spaceIds: spaces.values,
  });

  // Over the whole record, not the pages in hand: 770 proposals across 30
  // spaces, where the first page touches three of them.
  const {
    spaces: spaceFacets,
    isLoading: isLoadingSpaces,
    isError: isSpacesError,
  } = usePersonProposalSpaces({ spaceId });

  // Looked up once for the page. These are routinely spaces the viewer has never
  // opened, which the browse sidebar cannot name.
  const rowSpaceIds = React.useMemo(
    // The menu's spaces as well as the rows', so the two are one lookup rather
    // than two — the menu lists every space this person proposed into, which is
    // a superset of whatever the loaded rows touch.
    () => [...new Set([...proposals.map(proposal => proposal.spaceId), ...spaceFacets.map(facet => facet.id)])],
    [proposals, spaceFacets]
  );
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  const spaceOptions = React.useMemo(
    () =>
      spaceFacets.map(facet => ({
        value: facet.id,
        label: spaceLabel(labelsById, facet.id)?.name ?? `Space ${facet.id.slice(0, 6)}`,
        count: facet.count,
      })),
    [labelsById, spaceFacets]
  );

  const controls = (
    <RecordFilterRow
      sort={{ value: sort, options: SORT_OPTIONS, onChange: value => setSort(value as ProposalSort) }}
      // Dropped rather than drawn empty when the facets could not be read: a
      // menu with no options looks like a person who proposed into one space.
      dimensions={
        isSpacesError
          ? []
          : [
              {
                key: 'spaces',
                options: spaceOptions,
                values: spaces.values,
                onToggle: spaces.toggle,
                onClear: spaces.clear,
                anyLabel: 'Any space',
                noun: ['space', 'spaces'],
                isPending: isLoadingSpaces,
              },
            ]
      }
    />
  );

  // `isError` included, or a page that failed leaves the sentinel on screen to
  // ask for it again on every intersection.
  const sentinelRef = useInfiniteSentinel({ hasNextPage, isFetchingNextPage, isError, fetchNextPage });

  const isFiltered = spaces.values.length > 0;

  if (proposals.length === 0) {
    return (
      <Shell controls={controls}>
        <p className="py-6 text-body text-grey-04">{emptyLine({ isLoading, isError, isFiltered })}</p>
      </Shell>
    );
  }

  return (
    <Shell controls={controls}>
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

        {/*
         * 770 proposals on the reference account, so a page-two failure used to
         * leave twenty on screen looking like the whole record.
         */}
        {isError && !isFetchingNextPage && <PartialLoadError noun="proposals" onRetry={fetchNextPage} />}
      </div>
    </Shell>
  );
}

/**
 * The controls, then whatever the list currently is.
 *
 * Every state renders inside them — including the empty one, which needs them
 * most: an empty list is usually the filter's doing, and the menu that caused it
 * is the only way back.
 */
function Shell({ controls, children }: { controls: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      {controls}
      {children}
    </div>
  );
}

/**
 * What an empty list says, which depends on why it is empty.
 *
 * Three different facts, and printing the last for the first two is how a failed
 * request came to read as a person who has never proposed anything.
 */
export function emptyLine({
  isLoading,
  isError,
  isFiltered,
}: {
  isLoading: boolean;
  isError: boolean;
  isFiltered: boolean;
}) {
  if (isLoading) return 'Loading proposals…';
  if (isError) return 'Couldn’t load proposals.';
  if (isFiltered) return 'No proposals match these filters.';
  return 'No proposals yet';
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
    <div className="border-b border-grey-01">
      <GovernanceProposalRow
        overlay={
          /*
           * `from` and `returnSpaceId` are what bring the reader back here
           * rather than stranding them in the governance tab of a space they
           * were never in — see `useCloseProposal`.
           */
          <Link
            href={`/space/${proposal.spaceId}/governance?proposalId=${proposal.id}&from=profile&returnSpaceId=${returnSpaceId}`}
            className="absolute inset-0"
            aria-label={title}
          />
        }
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
        /*
         * Truthful, not `false`. The chip reads an ended `PROPOSED` row with
         * this false as **Rejected**, which threw away the distinction
         * `proposalStatusFromCurrent` exists to make — every unresolved proposal
         * reported as a failed one.
         *
         * A record is still read rather than acted on: `executeIn` is what
         * offers the Execute button, and omitting it leaves the chip saying
         * "Pending execution" as a plain label, with no control nested inside
         * this row's full-bleed link.
         */
        canExecute={proposal.isAwaitingExecution}
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
