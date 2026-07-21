'use client';

import * as React from 'react';

import cx from 'classnames';

import { isScorePropertyShown } from '~/core/blocks/data/is-score-property-shown';
import { isPlaceholderRankingEntry } from '~/core/blocks/ranking/ranking-pending-proposal-entries';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { RankingBlockGlobalPagination } from './ranking-block-global-pagination';
import { RankingPeriodMetadata } from './ranking-period-metadata';
import type { RankingBlockState } from './use-ranking-block-state';

const ROW_NAME_CLASS = 'block text-[16px] leading-[20px] font-normal tracking-[-0.35px] text-text';
const ROW_CLASS = 'flex w-full min-w-0 items-start gap-3';
const ROW_RANK_CLASS =
  'w-5 shrink-0 text-center text-[16px] leading-[20px] font-normal tracking-[-0.35px] text-grey-04 tabular-nums';

function RankingListRowSkeleton({ rank }: { rank: number }) {
  return (
    <div className={ROW_CLASS}>
      <span className={ROW_RANK_CLASS}>{rank}</span>
      <div className="min-w-0 flex-1">
        <Skeleton className="h-5 w-full max-w-md rounded" />
      </div>
      <Skeleton className="h-5 w-16 shrink-0 rounded" />
    </div>
  );
}

type ListRowProps = {
  rank: number;
  entityId: string;
  spaceId: string;
  name: string;
  showVoteButtons: boolean;
};

function RankingListRow({ rank, entityId, spaceId, name, showVoteButtons }: ListRowProps) {
  const href = NavUtils.toEntity(spaceId, entityId);

  return (
    <div className={ROW_CLASS}>
      <span className={ROW_RANK_CLASS}>{rank}</span>
      <Link href={href} className={cx(ROW_NAME_CLASS, 'min-w-0 flex-1 hover:underline')} title={name}>
        {name}
      </Link>
      {showVoteButtons ? (
        <div className="flex h-5 shrink-0 items-center">
          <EntityVoteButtons entityId={entityId} spaceId={spaceId} />
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  state: RankingBlockState;
};

export function RankingListView({ state }: Props) {
  const {
    spaceId,
    shownColumnIds,
    globalDisplayEntityIds,
    globalRankingEntryByEntityId,
    globalRankByEntityId,
    totalGlobalRankingEntityCount,
    entriesResolving,
    hasRankedByOthers,
    submissions,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
    periodState,
    showEmbeddedGlobalPagination,
    embeddedGlobalPageNumber,
    hasEmbeddedGlobalPreviousPage,
    hasEmbeddedGlobalNextPage,
    setEmbeddedGlobalPage,
  } = state;

  const showVoteButtons = isScorePropertyShown(shownColumnIds);

  const rows = globalDisplayEntityIds
    .map(entityId => {
      const entry = globalRankingEntryByEntityId.get(entityId);
      const rank = globalRankByEntityId.get(entityId);
      if (rank == null) return null;

      if (!entry || (entriesResolving && isPlaceholderRankingEntry(entry))) {
        return <RankingListRowSkeleton key={entityId} rank={rank} />;
      }

      return (
        <RankingListRow
          key={entityId}
          rank={rank}
          entityId={entityId}
          spaceId={spaceId}
          name={entry.name}
          showVoteButtons={showVoteButtons}
        />
      );
    })
    .filter(Boolean);

  const showLoadingRows = rows.length === 0 && entriesResolving && globalDisplayEntityIds.length > 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-2">
        {rows}
        {showLoadingRows
          ? globalDisplayEntityIds.map(entityId => (
              <RankingListRowSkeleton key={entityId} rank={globalRankByEntityId.get(entityId) ?? 0} />
            ))
          : null}
      </div>
      {!entriesResolving && rows.length === 0 && totalGlobalRankingEntityCount === 0 ? (
        <p className="text-metadata text-grey-04">No published items yet</p>
      ) : null}

      <div className="flex w-full items-end justify-between gap-3">
        <RankingPeriodMetadata
          className="mt-0"
          periodState={periodState}
          periodLabel={null}
          hasRankedByOthers={hasRankedByOthers}
          submissions={submissions}
          aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
          aggregatedRankingCount={aggregatedRankingCount}
        />

        {showEmbeddedGlobalPagination ? (
          <div className="ml-auto self-end [&>div:first-child]:hidden [&>div:last-child]:!mt-0 [&>div:last-child]:!mb-0 [&>div:last-child]:!justify-end">
            <RankingBlockGlobalPagination
              pageNumber={embeddedGlobalPageNumber}
              hasPreviousPage={hasEmbeddedGlobalPreviousPage}
              hasNextPage={hasEmbeddedGlobalNextPage}
              onSetPage={setEmbeddedGlobalPage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
