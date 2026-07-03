'use client';

import * as React from 'react';

import { DataBlockProvider } from '~/core/blocks/data/use-data-block';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import type { TopQuestionsRankingData } from '~/core/space-home/fetch-top-questions-ranking';
import { NavUtils } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { GeoImage } from '~/design-system/geo-image';
import { Eye } from '~/design-system/icons/eye';
import { RankingChart } from '~/design-system/icons/ranking-chart';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { RankingRankedBy } from '~/partials/blocks/table/ranking-period-metadata';
import type { InitialGlobalRanking } from '~/partials/blocks/table/use-ranking-block-state';
import { useRankingBlockState } from '~/partials/blocks/table/use-ranking-block-state';

type Props = {
  ranking: TopQuestionsRankingData;
};

/** Number of placeholder cards to show while the ordered ranking hydrates. */
const SKELETON_CARD_COUNT = 5;

function TopQuestionsGalleryCard({
  spaceId,
  entityId,
  name,
  image,
  rank,
}: {
  spaceId: string;
  entityId: string;
  name: string;
  image: string | null;
  rank: number;
}) {
  const href = NavUtils.toEntity(spaceId, entityId);
  const cover = image && image !== PLACEHOLDER_SPACE_IMAGE ? image : PLACEHOLDER_SPACE_IMAGE;

  return (
    <div className="group flex w-[200px] shrink-0 flex-col gap-3 rounded-[17px] p-1 pb-2 transition duration-200 hover:bg-grey-01 sm:w-[240px]">
      <Link href={href} entityId={entityId} spaceId={spaceId}>
        <div className="relative aspect-2/1 w-full overflow-clip rounded-lg bg-grey-01">
          <GeoImage
            value={cover}
            className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
            alt={name}
            fill
          />
          <span className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-text/80 px-1.5 text-metadata font-medium text-white">
            {rank}
          </span>
        </div>
      </Link>
      <Link href={href} entityId={entityId} spaceId={spaceId} className="px-1">
        <div className="line-clamp-2 text-smallTitle font-medium text-text">{name}</div>
      </Link>
    </div>
  );
}

function TopQuestionsRankingGalleryInner({
  ranking,
  initialGlobalRanking,
}: {
  ranking: TopQuestionsRankingData;
  initialGlobalRanking: InitialGlobalRanking;
}) {
  const state = useRankingBlockState({
    spaceId: ranking.spaceId,
    rankingStartDate: ranking.rankingStartDate,
    rankingEndDate: ranking.rankingEndDate,
    initialGlobalRanking,
  });

  const {
    globalDisplayEntityIds,
    globalRankingEntryByEntityId,
    hasRankedByOthers,
    submissions,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
    isLoadingGlobalEntries,
    hasMySubmission,
    openRankingCompose,
    isSaving,
  } = state;

  const actionLabel = hasMySubmission ? 'View' : 'Vote';
  const actionIcon = hasMySubmission ? <Eye color="white" /> : <RankingChart color="white" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-mediumTitle font-medium">Top questions</h4>
        <Button
          variant="primary"
          className="h-6 shrink-0 !rounded-md border-grey-02 bg-text !px-3 text-metadata whitespace-nowrap text-white hover:bg-text/90"
          icon={actionIcon}
          disabled={isSaving}
          onClick={() => void openRankingCompose(hasMySubmission ? 'view' : 'edit')}
        >
          {actionLabel}
        </Button>
      </div>

      {isLoadingGlobalEntries && globalDisplayEntityIds.length === 0 ? (
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
            <div key={index} className="w-[200px] shrink-0 sm:w-[240px]">
              <Skeleton className="aspect-2/1 w-full rounded-lg" />
              <Skeleton className="mt-3 h-5 w-3/4 rounded" />
            </div>
          ))}
        </div>
      ) : globalDisplayEntityIds.length === 0 ? (
        <p className="text-browseMenu text-grey-04">No questions have been ranked yet.</p>
      ) : (
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {globalDisplayEntityIds.map((entityId, index) => {
            const entry = globalRankingEntryByEntityId.get(entityId);
            if (!entry) return null;
            return (
              <TopQuestionsGalleryCard
                key={entityId}
                spaceId={ranking.spaceId}
                entityId={entityId}
                name={entry.name}
                image={entry.image}
                rank={index + 1}
              />
            );
          })}
        </div>
      )}

      {hasRankedByOthers ? (
        <RankingRankedBy
          submissions={submissions}
          aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
          aggregatedRankingCount={aggregatedRankingCount}
        />
      ) : null}
    </div>
  );
}

export function TopQuestionsRankingGallery({ ranking }: Props) {
  const initialGlobalRanking = React.useMemo<InitialGlobalRanking>(
    () => ({
      rankingName: ranking.rankingName,
      orderedEntityIds: ranking.orderedEntityIds,
      entries: ranking.entries,
    }),
    [ranking.entries, ranking.orderedEntityIds, ranking.rankingName]
  );

  return (
    <DataBlockProvider spaceId={ranking.spaceId} entityId={ranking.blockEntityId} relationId={ranking.relationId}>
      <TopQuestionsRankingGalleryInner ranking={ranking} initialGlobalRanking={initialGlobalRanking} />
    </DataBlockProvider>
  );
}
