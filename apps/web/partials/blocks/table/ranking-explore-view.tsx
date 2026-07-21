'use client';

import { isPlaceholderRankingEntry } from '~/core/blocks/ranking/ranking-pending-proposal-entries';

import { Skeleton } from '~/design-system/skeleton';

import { RankingBlockGlobalPagination } from './ranking-block-global-pagination';
import { RankingExploreFeedCard } from './ranking-explore-feed-card';
import { RankingPeriodMetadata } from './ranking-period-metadata';
import type { RankingBlockState } from './use-ranking-block-state';

function RankingExploreFeedCardSkeleton() {
  return (
    <article className="flex flex-col gap-2 border-b border-divider py-4 last:border-b-0">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-24" />
    </article>
  );
}

type Props = {
  state: RankingBlockState;
};

export function RankingExploreView({ state }: Props) {
  const {
    spaceId,
    resolveEntitySpaceId,
    embeddedBrowseDisplayEntityIds,
    embeddedBrowseEntryByEntityId,
    embeddedBrowseTotalCount,
    embeddedBrowseShowPagination,
    embeddedBrowsePageNumber,
    embeddedBrowseHasPreviousPage,
    embeddedBrowseHasNextPage,
    embeddedBrowseSetPage,
    entriesResolving,
    hasRankedByOthers,
    submissions,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
    periodState,
  } = state;

  const cards = embeddedBrowseDisplayEntityIds
    .map(entityId => {
      const entry = embeddedBrowseEntryByEntityId.get(entityId);
      if (!entry || (entriesResolving && isPlaceholderRankingEntry(entry))) {
        return <RankingExploreFeedCardSkeleton key={entityId} />;
      }

      return (
        <RankingExploreFeedCard
          key={entityId}
          entityId={entityId}
          entitySpaceId={resolveEntitySpaceId(entityId)}
          blockSpaceId={spaceId}
          entry={entry}
        />
      );
    })
    .filter(Boolean);

  const showLoadingCards = cards.length === 0 && entriesResolving && embeddedBrowseDisplayEntityIds.length > 0;
  const emptyMessage = 'No published items yet';

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col">
        {cards}
        {showLoadingCards
          ? embeddedBrowseDisplayEntityIds.map(entityId => <RankingExploreFeedCardSkeleton key={entityId} />)
          : null}
      </div>
      {!entriesResolving && cards.length === 0 && embeddedBrowseTotalCount === 0 ? (
        <p className="text-metadata text-grey-04">{emptyMessage}</p>
      ) : null}

      <div className="mt-1 flex w-full items-end justify-between gap-3">
        <RankingPeriodMetadata
          className="mt-0"
          periodState={periodState}
          periodLabel={null}
          hasRankedByOthers={hasRankedByOthers}
          submissions={submissions}
          aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
          aggregatedRankingCount={aggregatedRankingCount}
        />

        {embeddedBrowseShowPagination ? (
          <div className="ml-auto self-end [&>div:first-child]:hidden [&>div:last-child]:!mt-0 [&>div:last-child]:!mb-0 [&>div:last-child]:!justify-end">
            <RankingBlockGlobalPagination
              pageNumber={embeddedBrowsePageNumber}
              hasPreviousPage={embeddedBrowseHasPreviousPage}
              hasNextPage={embeddedBrowseHasNextPage}
              onSetPage={embeddedBrowseSetPage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
