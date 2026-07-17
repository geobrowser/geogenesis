'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import {
  getAggregatedRankingSubmissionCount,
  getAggregatedRankingSubmitterRefs,
  getOrderedRelationTargetIds,
} from '~/core/blocks/ranking/ranking-block-relations';
import { rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import { useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useResolvedRankingSubmitterSpaceIds } from '~/core/blocks/ranking/use-ranking-submitter-space-ids';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { getRelationsByToEntityIds } from '~/core/io/queries';
import {
  RANKING_END_DATE_PROPERTY_ID,
  RANKING_START_DATE_PROPERTY_ID,
  RANK_POSITION_PROPERTY_ID,
} from '~/core/ranking-block-ids';
import { useQueryEntity, useValues } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { RankingBlockGlobalPagination } from '~/partials/blocks/table/ranking-block-global-pagination';
import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';

const EXPLORE_RANKING_PAGE_SIZE = 4;
const ROW_IMAGE_SIZE = 32;

type ToEntityRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  spaceId: string;
};

function useRankingBlockDatesForExplore(blockId: string, spaceId: string) {
  const values = useValues({
    selector: v =>
      v.entity.id === blockId &&
      v.spaceId === spaceId &&
      !v.isDeleted &&
      (v.property.id === RANKING_START_DATE_PROPERTY_ID || v.property.id === RANKING_END_DATE_PROPERTY_ID),
  });

  return {
    startDate: values.find(v => v.property.id === RANKING_START_DATE_PROPERTY_ID)?.value ?? '',
    endDate: values.find(v => v.property.id === RANKING_END_DATE_PROPERTY_ID)?.value ?? '',
  };
}

function useRankingBlockPlacement(blockEntityId: string, spaceId: string) {
  return useQuery({
    queryKey: ['explore-ranking-block-placement', blockEntityId, spaceId],
    enabled: Boolean(blockEntityId && spaceId),
    staleTime: 60_000,
    queryFn: async () => {
      const relations = (await Effect.runPromise(
        getRelationsByToEntityIds([blockEntityId], SystemIds.BLOCKS, spaceId)
      )) as unknown as ToEntityRelation[];
      if (!relations?.length) return null;
      const match = relations.find(r => r.spaceId === spaceId) ?? relations[0];
      if (!match?.id || !match.fromEntityId) return null;
      return { parentEntityId: match.fromEntityId, relationId: match.id };
    },
  });
}

function useExploreRankingBlockData(blockId: string, spaceId: string) {
  const { entity: blockEntity } = useQueryEntity({ spaceId, id: blockId });
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
      aria-label={`Vote on ${item.title}`}
      className="ml-auto flex h-8 shrink-0 items-center rounded-lg bg-text px-3 text-[16px] leading-[18px] whitespace-nowrap text-white transition-colors hover:bg-text/90"
    >
      Vote
    </Link>
  );
}

function RankingRow({
  rank,
  entityId,
  spaceId,
  name,
  image,
  resolving,
}: {
  rank: number;
  entityId: string;
  spaceId: string;
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
        className="min-w-0 flex-1 truncate text-[16px] leading-[20px] font-normal tracking-[-0.35px] text-text hover:underline"
        title={label}
      >
        {label}
      </Link>
    </div>
  );
}

/** Ranking Block body: ordered leaderboard rows; images only when the entry has avatar/cover. */
export function RankingCardBody({ item }: { item: ExploreFeedItem }) {
  const [pageNumber, setPageNumber] = React.useState(0);
  const { globalRankingEntityIds, aggregatedSubmitterSpaceIds, aggregatedRankingCount } = useExploreRankingBlockData(
    item.entityId,
    item.spaceId
  );

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

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Link href={NavUtils.toEntity(item.spaceId, item.entityId)}>
        <h2 className="mt-0! text-[19px]! leading-[23px]! font-semibold! tracking-[-0.02em] text-text hover:underline">
          {item.title}
        </h2>
      </Link>

      <div className="flex flex-col gap-2">
        {pageIds.map((entityId, index) => {
          const entry = entryById.get(entityId);
          return (
            <RankingRow
              key={entityId}
              rank={safePage * EXPLORE_RANKING_PAGE_SIZE + index + 1}
              entityId={entityId}
              spaceId={item.spaceId}
              name={entry?.name ?? null}
              image={entry?.image ?? null}
              resolving={isLoading}
            />
          );
        })}
        {!isLoading && pageIds.length === 0 ? (
          <p className="text-metadata text-grey-04">No published items yet</p>
        ) : null}
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
                pageNumber={safePage}
                hasPreviousPage={safePage > 0}
                hasNextPage={safePage < totalPages - 1}
                onSetPage={next => {
                  if (next === 'previous') setPageNumber(p => Math.max(0, p - 1));
                  else if (next === 'next') setPageNumber(p => Math.min(totalPages - 1, p + 1));
                  else setPageNumber(next);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
