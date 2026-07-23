'use client';

import * as React from 'react';

import { rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import type { FeaturedRanking } from '~/core/io/subgraph/fetch-featured-rankings';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';
import { OverviewSideRailSection } from '~/partials/side-panel/overview-side-rail';

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
    <OverviewSideRailSection title="Featured rankings">
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
    </OverviewSideRailSection>
  );
}

function FeaturedRankingCard({ ranking }: { ranking: FeaturedRanking }) {
  // The Vote button opens the ranking's fullscreen view (mode: 'view'), from
  // which the user can build and submit their ranking — the same target the
  // in-page fullscreen trigger uses (table-block-ranking.tsx).
  const href = rankingComposeHref({
    spaceId: ranking.spaceId,
    blockEntityId: ranking.blockEntityId,
    relationId: ranking.relationId,
    parentEntityId: ranking.parentEntityId,
    rankingStartDate: ranking.rankingStartDate,
    rankingEndDate: ranking.rankingEndDate,
    mode: 'view',
  });

  // Gate on resolved submitter spaces, not the raw count: when submitters exist
  // but none resolve to a space, the avatar group renders nothing, and keying off
  // the count alone would leave a dangling "Ranked by" label with no avatars.
  const hasRankedBy = ranking.submitterSpaceIds.length > 0;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-grey-02 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[16px] leading-[20px] font-medium text-text">{ranking.name}</span>
        {hasRankedBy ? (
          <span className="flex min-w-0 flex-nowrap items-center gap-2 text-metadata text-grey-04">
            <span className="shrink-0">Ranked by</span>
            <RankingAggregatedSubmitterAvatars
              submitterSpaceIds={ranking.submitterSpaceIds}
              totalCount={ranking.submissionCount || ranking.submitterSpaceIds.length}
            />
          </span>
        ) : null}
      </div>

      <Link
        href={href}
        aria-label={`Vote on ${ranking.name}`}
        className="flex h-8 shrink-0 items-center rounded-lg border border-grey-02 px-3 text-[16px] leading-[18px] text-text shadow-button transition-colors hover:border-text"
      >
        Vote
      </Link>
    </div>
  );
}
