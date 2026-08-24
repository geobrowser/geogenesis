'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import {
  RANKING_DATE_PROPERTY_IDS,
  RANKING_END_PROPERTY_IDS,
  RANKING_START_PROPERTY_IDS,
  resolveRankingDateValue,
} from '~/core/blocks/ranking/ranking-block-dates';
import {
  getAggregatedRankingSubmissionCount,
  getAggregatedRankingSubmitterRefs,
  getOrderedRelationTargetIds,
} from '~/core/blocks/ranking/ranking-block-relations';
import { rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import { useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useResolvedRankingSubmitterSpaceIds } from '~/core/blocks/ranking/use-ranking-submitter-space-ids';
import { resolveBlockPlacement } from '~/core/blocks/resolve-block-placement';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { RANK_POSITION_PROPERTY_ID } from '~/core/ranking-block-ids';
import { useQueryEntity, useValues } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { RankingBlockGlobalPagination } from '~/partials/blocks/table/ranking-block-global-pagination';
import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';
import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

const EXPLORE_RANKING_PAGE_SIZE = 4;
const ROW_IMAGE_SIZE = 32;

function useRankingBlockDatesForExplore(blockId: string, spaceId: string) {
  const values = useValues({
    selector: v =>
      v.entity.id === blockId && v.spaceId === spaceId && !v.isDeleted && RANKING_DATE_PROPERTY_IDS.has(v.property.id),
  });

  const readValue = (propertyId: string) => values.find(v => v.property.id === propertyId)?.value;

  return {
    startDate: resolveRankingDateValue(RANKING_START_PROPERTY_IDS, readValue).value,
    endDate: resolveRankingDateValue(RANKING_END_PROPERTY_IDS, readValue).value,
  };
}

function useRankingBlockPlacement(blockEntityId: string, spaceId: string) {
  return useQuery({
    queryKey: ['explore-ranking-block-placement', blockEntityId, spaceId],
    enabled: Boolean(blockEntityId && spaceId),
    staleTime: 60_000,
    queryFn: () => resolveBlockPlacement(blockEntityId, spaceId),
  });
}

function useExploreRankingBlockData(blockId: string, spaceId: string) {
  const { entity: blockEntity, isLoading: isBlockLoading } = useQueryEntity({ spaceId, id: blockId });
  const blockRelations = blockEntity?.relations ?? [];

  const globalRankingEntityIds = React.useMemo(
    () => getOrderedRelationTargetIds(blockRelations, blockId, RANK_POSITION_PROPERTY_ID, spaceId),
    [blockId, blockRelations, spaceId]
  );

  const aggregatedSubmitterRefs = React.useMemo(
    () => getAggregatedRankingSubmitterRefs(blockRelations, blockId, spaceId),
    [blockId, blockRelations, spaceId]
  );

  const aggregatedSubmitterSpaceIds = useResolvedRankingSubmitterSpaceIds(aggregatedSubmitterRefs);

  const aggregatedRankingCount = React.useMemo(
    () => getAggregatedRankingSubmissionCount(blockRelations, blockId, spaceId),
    [blockId, blockRelations, spaceId]
  );

  return {
    globalRankingEntityIds,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
    isBlockLoading,
  };
}

export function RankingVoteButton({ item }: { item: ExploreFeedItem }) {
  const { startDate, endDate } = useRankingBlockDatesForExplore(item.entityId, item.spaceId);
  const { data: placement } = useRankingBlockPlacement(item.entityId, item.spaceId);

  if (!placement) return null;

  const href = rankingComposeHref({
    spaceId: item.spaceId,
    blockEntityId: item.entityId,
    relationId: placement.relationId,
    parentEntityId: placement.parentEntityId,
    rankingStartDate: startDate,
    rankingEndDate: endDate,
    mode: 'view',
  });

  return (
    <Link
      href={href}
      aria-label={`Rank ${item.title}`}
      className="flex h-8 shrink-0 items-center rounded-lg bg-text px-3 text-[16px] leading-[18px] whitespace-nowrap text-white transition-colors hover:bg-text/90"
    >
      Rank
    </Link>
  );
}

export function RankingRow({
  rank,
  entityId,
  spaceId,
  voteSpaceId,
  name,
  image,
  resolving,
}: {
  rank: number;
  entityId: string;
  spaceId: string;
  voteSpaceId: string | null;
  name: string | null;
  image: string | null;
  resolving: boolean;
}) {
  if (resolving && !name) {
    return (
      <div className="flex w-full min-w-0 items-center gap-3">
        <span className="w-5 shrink-0 text-center text-[16px] leading-[20px] font-normal tracking-[-0.35px] text-grey-04 tabular-nums">
          {rank}
        </span>
        <Skeleton className="h-5 w-full max-w-sm rounded" />
      </div>
    );
  }

  const href = NavUtils.toEntity(spaceId, entityId);
  const label = name ?? 'Untitled';

  return (
    <div className="flex w-full min-w-0 items-center gap-3">
      <span className="w-5 shrink-0 text-center text-[16px] leading-[20px] font-normal tracking-[-0.35px] text-grey-04 tabular-nums">
        {rank}
      </span>
      {image ? (
        <Link
          href={href}
          className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-grey-01"
          aria-hidden
          tabIndex={-1}
        >
          <FallbackImage value={image} sizes={`${ROW_IMAGE_SIZE * 2}px`} className="object-cover" />
        </Link>
      ) : null}
      <Link
        href={href}
        className="min-w-0 flex-1 truncate text-[16px] leading-[20px] font-normal tracking-[-0.35px] text-grey-04 hover:underline"
        title={label}
      >
        {label}
      </Link>
      {voteSpaceId ? (
        <div className="shrink-0 text-metadataMedium text-text">
          <EntityVoteButtons entityId={entityId} spaceId={voteSpaceId} claimResponderAvatarsPosition="trailing" />
        </div>
      ) : null}
    </div>
  );
}

/** Ranking Block body: ordered leaderboard rows; images only when the entry has avatar/cover. */
export function RankingCardBody({ item, actions }: { item: ExploreFeedItem; actions?: React.ReactNode }) {
  const [pageNumber, setPageNumber] = React.useState(0);
  const { globalRankingEntityIds, aggregatedSubmitterSpaceIds, aggregatedRankingCount, isBlockLoading } =
    useExploreRankingBlockData(item.entityId, item.spaceId);

  const totalPages = Math.max(1, Math.ceil(globalRankingEntityIds.length / EXPLORE_RANKING_PAGE_SIZE));
  const safePage = Math.min(pageNumber, totalPages - 1);
  const pageIds = globalRankingEntityIds.slice(
    safePage * EXPLORE_RANKING_PAGE_SIZE,
    (safePage + 1) * EXPLORE_RANKING_PAGE_SIZE
  );

  const { entries, isLoading } = useRankingEntryEntities(item.spaceId, pageIds);
  const entryById = React.useMemo(() => new Map(entries.map(entry => [entry.entityId, entry])), [entries]);

  const hasRankedBy = aggregatedSubmitterSpaceIds.length > 0;
  const showPagination = globalRankingEntityIds.length > EXPLORE_RANKING_PAGE_SIZE;

  // While the block entity resolves we have no ids yet, so show skeleton rows rather than the
  // empty state. Only call it empty once the block has loaded and still has no ranked ids.
  const rowsLoading = isBlockLoading || isLoading;
  const showEmpty = !rowsLoading && pageIds.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={NavUtils.toEntity(item.spaceId, item.entityId)} className="min-w-0 flex-1">
          <h2 className="mt-0! truncate text-[19px]! leading-[21px]! font-medium! text-[#2A2B2E] hover:underline">
            {item.title}
          </h2>
        </Link>
        <RankingVoteButton item={item} />
      </div>

      <div className="flex flex-col gap-2">
        {pageIds.map((entityId, index) => {
          const entry = entryById.get(entityId);
          const entrySpaceId = entry?.spaceId ?? null;
          return (
            <RankingRow
              key={entityId}
              rank={safePage * EXPLORE_RANKING_PAGE_SIZE + index + 1}
              entityId={entityId}
              spaceId={entrySpaceId || item.spaceId}
              voteSpaceId={entrySpaceId}
              name={entry?.name ?? null}
              image={entry?.image ?? null}
              resolving={isLoading || !entry}
            />
          );
        })}
        {pageIds.length === 0 && rowsLoading
          ? Array.from({ length: EXPLORE_RANKING_PAGE_SIZE }).map((_, index) => (
              <div key={index} className="flex w-full min-w-0 items-center gap-3">
                <span className="w-5 shrink-0 text-center text-[16px] leading-[20px] font-normal tracking-[-0.35px] text-grey-04 tabular-nums">
                  {index + 1}
                </span>
                <Skeleton className="h-5 w-full max-w-sm rounded" />
              </div>
            ))
          : null}
        {showEmpty ? <p className="text-metadata text-grey-04">No published items yet</p> : null}
      </div>

      {hasRankedBy || showPagination ? (
        <div className="flex w-full items-end justify-between gap-3">
          {hasRankedBy ? (
            <RankingAggregatedSubmitterAvatars
              submitterSpaceIds={aggregatedSubmitterSpaceIds}
              totalCount={aggregatedRankingCount || aggregatedSubmitterSpaceIds.length}
            />
          ) : (
            <span />
          )}
          {showPagination ? (
            <div className="ml-auto self-end [&>div:first-child]:hidden [&>div:last-child]:!mt-0 [&>div:last-child]:!mb-0 [&>div:last-child]:!justify-end">
              <RankingBlockGlobalPagination
                hasPreviousPage={safePage > 0}
                hasNextPage={safePage < totalPages - 1}
                onSetPage={next => {
                  // Step from `safePage`, not the raw `pageNumber`. When the id list shrinks
                  // (sync update, entries unpublished) `safePage` clamps for rendering but
                  // `pageNumber` stays high, so stepping from it burns clicks with no visible
                  // move — pageNumber 5 against totalPages 2 costs three dead "Previous" taps.
                  if (next === 'previous') setPageNumber(Math.max(0, safePage - 1));
                  else if (next === 'next') setPageNumber(Math.min(totalPages - 1, safePage + 1));
                  else setPageNumber(next);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {actions}
    </div>
  );
}
