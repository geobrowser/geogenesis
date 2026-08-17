'use client';

import * as React from 'react';

import { rankingComposeHref } from '~/core/blocks/ranking/ranking-compose-url';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import type { FeaturedRanking } from '~/core/io/subgraph/fetch-featured-rankings';
import { normId } from '~/core/utils/norm-id';

import { FallbackImage } from '~/design-system/fallback-image';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { RightArrowLong } from '~/design-system/icons/right-arrow-long';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { RankingAggregatedSubmitterAvatars } from '~/partials/blocks/table/ranking-period-metadata';

import { ExploreJoinSpaceButton } from './explore-join-space-button';

type Props = {
  rankings: FeaturedRanking[];
  /** Spaces the viewer already belongs to — no Join pill for these. */
  memberOrEditorSpaceIds: Set<string>;
  /** Spaces with an in-flight membership request — render "Membership pending". */
  pendingMembershipSpaceIds: Set<string>;
};

// The redesigned cards are tall (leaderboard + footer), so cap the initial list
// lower than the old compact rows and reveal the rest behind "Show more".
const INITIAL_VISIBLE_COUNT = 3;

// Leaderboard page size — show the top five entries before paging.
const ENTRIES_PER_PAGE = 5;

export function FeaturedRankingsSection({ rankings, memberOrEditorSpaceIds, pendingMembershipSpaceIds }: Props) {
  const [showAll, setShowAll] = React.useState(false);

  if (rankings.length === 0) return null;

  const visible = showAll ? rankings : rankings.slice(0, INITIAL_VISIBLE_COUNT);
  const hasMore = rankings.length > INITIAL_VISIBLE_COUNT;

  return (
    <section className="flex flex-col">
      <div className="flex flex-col gap-1 pb-4">
        <h2 className="text-[19px] leading-[23px] font-semibold tracking-[-0.02em] text-text">Featured rankings</h2>
        <p className="text-[16px] leading-[20px] text-grey-04">Rank top content every day to impact what people see</p>
      </div>

      <ul className="flex flex-col gap-3">
        {visible.map(ranking => (
          <li key={ranking.blockEntityId}>
            <FeaturedRankingCard
              ranking={ranking}
              isMember={memberOrEditorSpaceIds.has(normId(ranking.spaceId))}
              pending={pendingMembershipSpaceIds.has(normId(ranking.spaceId))}
            />
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

function FeaturedRankingCard({
  ranking,
  isMember,
  pending,
}: {
  ranking: FeaturedRanking;
  isMember: boolean;
  pending: boolean;
}) {
  // The Rank button opens the ranking's fullscreen view (mode: 'view'), from
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

  const { openSidePanel } = useEntitySidePanel();

  const [page, setPage] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(ranking.topEntries.length / ENTRIES_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * ENTRIES_PER_PAGE;
  const pageEntries = ranking.topEntries.slice(pageStart, pageStart + ENTRIES_PER_PAGE);
  const showPager = ranking.topEntries.length > ENTRIES_PER_PAGE;

  // Gate on resolved submitter spaces, not the raw count: when submitters exist
  // but none resolve to a space, the avatar group renders nothing.
  const hasRankedBy = ranking.submitterSpaceIds.length > 0;
  const hasSpaceBadge = Boolean(ranking.spaceName);

  return (
    <div className="flex flex-col rounded-xl border border-grey-02 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {hasSpaceBadge ? (
            <>
              <span className="relative size-3 shrink-0 overflow-hidden rounded bg-grey-01">
                <FallbackImage value={ranking.spaceImage ?? ''} sizes="12px" className="object-cover" />
              </span>
              <span className="truncate text-[14px] leading-[16px] text-text">{ranking.spaceName}</span>
            </>
          ) : null}
          {!isMember ? (
            <span className="shrink-0">
              <ExploreJoinSpaceButton
                spaceId={ranking.spaceId}
                hasRequestedSpaceMembership={pending}
                variant="pill"
                label="Join"
              />
            </span>
          ) : null}
        </div>
        <Link
          href={href}
          aria-label={`Rank ${ranking.name}`}
          className="flex h-7 shrink-0 items-center rounded-full bg-text px-2.5 text-[16px] leading-[13px] text-white transition-colors hover:bg-text/90"
        >
          Rank
        </Link>
      </div>

      <span className="mt-1 truncate text-[16px] leading-[20px] font-medium text-text">{ranking.name}</span>

      {pageEntries.length > 0 ? (
        <ol className="mt-5 flex flex-col gap-1.5">
          {pageEntries.map((entry, index) => (
            <li key={entry.entityId} className="flex min-h-6 items-center gap-3">
              <span className="w-3 shrink-0 text-[16px] leading-[18px] font-medium text-text tabular-nums">
                {pageStart + index + 1}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                {entry.image ? (
                  <span className="relative size-6 shrink-0 overflow-hidden rounded bg-grey-01">
                    <FallbackImage value={entry.image} sizes="24px" className="object-cover" />
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => openSidePanel(entry.entityId, ranking.spaceId, false)}
                  className="min-w-0 flex-1 truncate text-left text-[16px] leading-[20px] text-text hover:underline"
                >
                  {entry.name}
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {hasRankedBy || showPager ? (
        <div className="mt-5 flex min-h-4 items-center justify-between gap-3">
          <span className="flex min-w-0 items-center">
            {hasRankedBy ? (
              <RankingAggregatedSubmitterAvatars
                submitterSpaceIds={ranking.submitterSpaceIds}
                totalCount={ranking.submissionCount || ranking.submitterSpaceIds.length}
                size={12}
              />
            ) : null}
          </span>
          {showPager ? (
            <span className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                aria-label="Previous entries"
                disabled={currentPage === 0}
                onClick={() => setPage(prev => Math.max(0, prev - 1))}
              >
                <LeftArrowLong color={currentPage === 0 ? 'grey-03' : 'text'} />
              </button>
              <button
                type="button"
                aria-label="Next entries"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(prev => Math.min(pageCount - 1, prev + 1))}
              >
                <RightArrowLong color={currentPage >= pageCount - 1 ? 'grey-03' : 'text'} />
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
