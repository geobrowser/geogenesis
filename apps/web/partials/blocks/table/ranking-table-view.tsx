'use client';

import cx from 'classnames';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';

import { Text } from '~/design-system/text';

import { RankingBlockBody } from './ranking-block-body';
import { RankingCardConfigProvider, useRankingShownProperties } from './ranking-card-config';
import { RankingPeriodMetadata } from './ranking-period-metadata';
import { type InitialGlobalRanking, type InitialSharedRanking, useRankingBlockState } from './use-ranking-block-state';

type Props = {
  spaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  rankEntityId?: string;
  authorSpaceId?: string;
  ogVersion?: string;
  initialGlobalRanking?: InitialGlobalRanking;
  initialSharedRanking?: InitialSharedRanking;
};

/** Fullscreen ranking browse view with compose-aligned title and metadata typography. */
export function RankingTableView({
  spaceId,
  rankingStartDate = '',
  rankingEndDate = '',
  rankEntityId = '',
  authorSpaceId = '',
  ogVersion = '',
  initialGlobalRanking,
  initialSharedRanking,
}: Props) {
  const isMobile = useIsMobileLayout();
  const { cardConfig } = useRankingShownProperties();
  const state = useRankingBlockState({
    spaceId,
    rankingStartDate,
    rankingEndDate,
    sharedRankEntityId: rankEntityId,
    sharedAuthorSpaceId: authorSpaceId,
    sharedOgVersion: ogVersion,
    initialGlobalRanking,
    initialSharedRanking,
  });
  const {
    displayName,
    periodState,
    periodLabel,
    hasRankedByOthers,
    submissions,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
  } = state;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <Text
          variant="largeTitle"
          className={cx('!leading-[1.3]', !isMobile && '!text-[44px]')}
          ellipsize={!isMobile}
          aria-label={displayName}
        >
          {displayName}
        </Text>
        {periodLabel || hasRankedByOthers ? (
          <RankingPeriodMetadata
            className={isMobile ? undefined : 'mt-0'}
            periodState={periodState}
            periodLabel={periodLabel}
            hasRankedByOthers={hasRankedByOthers}
            submissions={submissions}
            aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
            aggregatedRankingCount={aggregatedRankingCount}
          />
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <RankingCardConfigProvider value={cardConfig}>
          <RankingBlockBody state={state} presentation="fullscreen" />
        </RankingCardConfigProvider>
      </div>
    </div>
  );
}
