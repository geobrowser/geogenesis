'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import type { FeaturedRanking, FeaturedRankingEntry } from '~/core/io/subgraph/fetch-featured-rankings';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { FallbackImage } from '~/design-system/fallback-image';
import { RankingChart } from '~/design-system/icons/ranking-chart';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';

import { useFeaturedRankingCompletion } from './use-featured-ranking-completion';

type Props = {
  rankings: FeaturedRanking[];
};

// Show five rankings, with a "Show more" toggle revealing the rest — mirrors the
// "Join spaces" featured-spaces section.
const INITIAL_VISIBLE_COUNT = 5;

export function FeaturedRankingsSection({ rankings }: Props) {
  const [showAll, setShowAll] = React.useState(false);

  if (rankings.length === 0) return null;

  const visible = showAll ? rankings : rankings.slice(0, INITIAL_VISIBLE_COUNT);
  const hasMore = rankings.length > INITIAL_VISIBLE_COUNT;

  return (
    <section className="flex flex-col">
      <h2 className="sticky top-0 z-20 bg-white pt-1 pb-4 text-[19px] leading-[23px] font-semibold tracking-[-0.02em] text-text">
        Featured rankings
      </h2>

      <ul className="flex flex-col gap-3">
        {visible.map(ranking => (
          <li key={ranking.blockEntityId}>
            <FeaturedRankingCard ranking={ranking} />
          </li>
        ))}
      </ul>

      {hasMore ? (
        <button
          type="button"
          onClick={() => setShowAll(prev => !prev)}
          className="mt-3 self-start rounded-full border border-grey-02 py-1.5 pr-2.5 pl-2 text-[16px] leading-[18px] text-grey-04 transition-colors hover:border-text hover:text-text"
        >
          {showAll ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </section>
  );
}

function FeaturedRankingCard({ ranking }: { ranking: FeaturedRanking }) {
  const router = useRouter();
  const { hasCompleted, isLoading } = useFeaturedRankingCompletion(ranking.blockEntityId, ranking.spaceId);

  const href = rankingComposeHref({
    spaceId: ranking.spaceId,
    blockEntityId: ranking.blockEntityId,
    relationId: ranking.relationId,
    parentEntityId: ranking.parentEntityId,
    rankingStartDate: ranking.rankingStartDate,
    rankingEndDate: ranking.rankingEndDate,
    mode: hasCompleted ? 'view' : 'edit',
  });

  const hasRankedBy = ranking.submitterSpaceIds.length > 0 || ranking.submissionCount > 0;

  return (
    <div className="rounded-lg border border-grey-02 p-5">
      <h3 className="truncate text-[16px] leading-[17px] font-medium text-[#2A2B2E]">{ranking.name}</h3>

      {ranking.topEntries.length > 0 ? (
        <ol className="mt-4 flex list-none flex-col gap-2 p-0">
          {ranking.topEntries.map((entry, index) => (
            <FeaturedRankingEntryRow key={entry.entityId} entry={entry} rank={index + 1} />
          ))}
        </ol>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        {hasRankedBy ? (
          <span className="flex min-w-0 flex-nowrap items-center">
            <span className="sr-only">Ranked by</span>
            <RankingAggregatedSubmitterAvatars
              submitterSpaceIds={ranking.submitterSpaceIds}
              totalCount={ranking.submissionCount || ranking.submitterSpaceIds.length}
              size={16}
            />
          </span>
        ) : (
          <span />
        )}

        {hasCompleted ? (
          <Button
            variant="secondary"
            className="h-8 shrink-0 !rounded-full !border-text !bg-white !px-3 text-[16px] whitespace-nowrap !text-text"
            icon={<RankingChart />}
            disabled={isLoading}
            onClick={() => router.push(href)}
          >
            View
          </Button>
        ) : (
          <Button
            variant="primary"
            className="h-8 shrink-0 !rounded-full border-grey-02 bg-text !px-3 text-[16px] whitespace-nowrap text-white hover:bg-text/90 focus-visible:border-text focus-visible:shadow-inner-text"
            icon={<RankingChart color="white" />}
            disabled={isLoading}
            onClick={() => router.push(href)}
          >
            Add my ranking
          </Button>
        )}
      </div>
    </div>
  );
}

function FeaturedRankingEntryRow({ entry, rank }: { entry: FeaturedRankingEntry; rank: number }) {
  return (
    <li className="flex min-w-0 items-center">
      <span className="w-4 shrink-0 text-[16px] leading-[18px] font-medium tracking-[-0.48px] text-[#2A2B2E] tabular-nums">
        {rank}
      </span>
      <span className="ml-3 size-6 shrink-0 overflow-hidden rounded-full">
        {entry.image ? (
          <FallbackImage value={entry.image} sizes="24px" className="size-full object-cover" />
        ) : (
          <Avatar size={24} value={entry.entityId} />
        )}
      </span>
      <span className="ml-2 min-w-0 truncate text-[16px] leading-[20px] font-normal tracking-[-0.35px] text-[#2A2B2E]">
        {entry.name}
      </span>
    </li>
  );
}
