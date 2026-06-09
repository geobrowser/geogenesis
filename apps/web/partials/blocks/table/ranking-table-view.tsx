'use client';

import cx from 'classnames';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';

import { Text } from '~/design-system/text';

import { RankingBlockBody } from './ranking-block-body';
import { RankingPeriodMetadata } from './ranking-period-metadata';
import { useRankingBlockState } from './use-ranking-block-state';

type Props = {
  spaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

/** Fullscreen ranking browse view with compose-aligned title and metadata typography. */
export function RankingTableView({ spaceId, rankingStartDate = '', rankingEndDate = '' }: Props) {
  const isMobile = useIsMobileLayout();
  const state = useRankingBlockState({ spaceId, rankingStartDate, rankingEndDate });
  const { displayName, periodState, periodLabel, hasRankedByOthers, submissions, aggregatedRankingEntityIds } = state;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-x-hidden overflow-y-auto">
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <Text
          variant="largeTitle"
          className={cx(!isMobile && '!text-[44px]')}
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
            aggregatedRankingEntityIds={aggregatedRankingEntityIds}
          />
        ) : null}
      </div>

      <RankingBlockBody state={state} presentation="fullscreen" />
    </div>
  );
}
