'use client';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useEntityMedia, useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { NavUtils } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { RankingBlockGlobalPagination } from './ranking-block-global-pagination';
import { RankingPeriodMetadata } from './ranking-period-metadata';
import type { RankingBlockState } from './use-ranking-block-state';

function RankingGalleryCard({
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
  const imageUrl = directIpfs ?? lookedUpFromHint ?? coverUrl ?? avatarUrl ?? PLACEHOLDER_SPACE_IMAGE;
  const href = NavUtils.toEntity(spaceId, entityId);

  return (
    <div className="w-[240px] shrink-0">
      <Link href={href} className="block">
        <div className="relative h-[120px] w-[240px] overflow-hidden rounded-xl bg-grey-01">
          <GeoImage value={imageUrl} className="object-cover" fill alt="" />
        </div>
      </Link>
      <Link href={href} className="mt-2 block">
        <p className="line-clamp-2 text-[19px] font-medium leading-[1.3] text-text">{name}</p>
      </Link>
    </div>
  );
}

function RankingGalleryCardSkeleton({ keyId }: { keyId: string }) {
  return (
    <div key={keyId} className="w-[240px] shrink-0">
      <Skeleton className="h-[120px] w-[240px] rounded-xl" />
      <Skeleton className="mt-2 h-6 w-[180px]" />
    </div>
  );
}

type Props = {
  state: RankingBlockState;
};

export function RankingGalleryView({ state }: Props) {
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
    openRankingCompose,
    showEmbeddedGlobalPagination,
    embeddedGlobalPageNumber,
    hasEmbeddedGlobalPreviousPage,
    hasEmbeddedGlobalNextPage,
    setEmbeddedGlobalPage,
  } = state;

  const cards = globalDisplayEntityIds
    .map(entityId => {
      const entry = globalRankingEntryByEntityId.get(entityId);
      if (!entry) return null;

      return (
        <RankingGalleryCard
          key={entityId}
          entityId={entityId}
          spaceId={spaceId}
          name={entry.name}
          imageHint={entry.image}
        />
      );
    })
    .filter(Boolean);

  const showLoadingCards = cards.length === 0 && entriesResolving && globalDisplayEntityIds.length > 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="primary"
          className="h-8 shrink-0 !rounded-full border-grey-02 bg-text !px-3 text-[16px] whitespace-nowrap text-white hover:bg-text/90 focus-visible:border-text focus-visible:shadow-inner-text"
          onClick={() => void openRankingCompose('view')}
        >
          Vote
        </Button>
      </div>

      <div className="flex flex-wrap gap-8">
        {cards}
        {showLoadingCards
          ? globalDisplayEntityIds.map(entityId => <RankingGalleryCardSkeleton key={entityId} keyId={entityId} />)
          : null}
      </div>
      {!entriesResolving && cards.length === 0 && totalGlobalRankingEntityCount === 0 ? (
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
          <div className="[&_div]:!mt-0 [&_div]:!mb-0 [&_div]:!justify-end">
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
