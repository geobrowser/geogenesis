'use client';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { isPlaceholderRankingEntry } from '~/core/blocks/ranking/ranking-pending-proposal-entries';
import { useEntityMedia, useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { NavUtils } from '~/core/utils/utils';

import { ThumbGeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { RankingBlockGlobalPagination } from './ranking-block-global-pagination';
import { RankingPeriodMetadata } from './ranking-period-metadata';
import type { RankingBlockState } from './use-ranking-block-state';

function RankingPillItem({
  entityId,
  spaceId,
  name,
  imageHint,
}: {
  entityId: string;
  spaceId: string;
  name: string;
  imageHint?: string | null;
}) {
  const { avatarUrl, coverUrl } = useEntityMedia(entityId, spaceId);
  const directIpfs = imageHint && imageHint.startsWith('ipfs://') ? imageHint : undefined;
  const lookedUpFromHint = useImageUrlFromEntity(imageHint && !directIpfs ? imageHint : undefined, spaceId);
  // Prefer avatar for the circular 16px slot; fall back to cover / hint / placeholder.
  const imageUrl = directIpfs ?? lookedUpFromHint ?? avatarUrl ?? coverUrl ?? PLACEHOLDER_SPACE_IMAGE;
  const href = NavUtils.toEntity(spaceId, entityId);

  return (
    <Link
      href={href}
      className="inline-flex h-8 max-w-full shrink-0 items-center gap-2 overflow-hidden rounded-full border border-grey-02 bg-white p-2 text-[16px] leading-[13px] font-normal tracking-[-0.35px] text-text transition-colors hover:border-text"
      title={name}
    >
      <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-full bg-grey-01">
        <ThumbGeoImage value={imageUrl} className="object-cover" alt="" />
      </span>
      <span className="min-w-0 truncate">{name}</span>
    </Link>
  );
}

function RankingPillItemSkeleton() {
  return (
    <div className="inline-flex h-8 w-[79px] shrink-0 items-center gap-2 overflow-hidden rounded-full border border-grey-02 bg-white p-2">
      <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
      <Skeleton className="h-3 min-w-0 flex-1 rounded" />
    </div>
  );
}

type Props = {
  state: RankingBlockState;
};

export function RankingPillView({ state }: Props) {
  const {
    spaceId,
    globalDisplayEntityIds,
    globalRankingEntryByEntityId,
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

  const pills = globalDisplayEntityIds
    .map(entityId => {
      const entry = globalRankingEntryByEntityId.get(entityId);
      if (!entry) return null;

      if (entriesResolving && isPlaceholderRankingEntry(entry)) {
        return <RankingPillItemSkeleton key={entityId} />;
      }

      return (
        <RankingPillItem
          key={entityId}
          entityId={entityId}
          spaceId={spaceId}
          name={entry.name}
          imageHint={entry.image}
        />
      );
    })
    .filter(Boolean);

  const showLoadingPills = pills.length === 0 && entriesResolving && globalDisplayEntityIds.length > 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {pills}
        {showLoadingPills
          ? globalDisplayEntityIds.map(entityId => <RankingPillItemSkeleton key={entityId} />)
          : null}
      </div>
      {!entriesResolving && pills.length === 0 && totalGlobalRankingEntityCount === 0 ? (
        <p className="text-metadata text-grey-04">No published items yet</p>
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
