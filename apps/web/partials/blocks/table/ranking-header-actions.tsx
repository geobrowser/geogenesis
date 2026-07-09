'use client';

import { Button } from '~/design-system/button';
import { RankingChart } from '~/design-system/icons/ranking-chart';

import { getRankingPeriodIcon } from './ranking-period-metadata';
import type { RankingBlockState } from './use-ranking-block-state';

type Props = {
  state: RankingBlockState;
};

/**
 * Period label + Vote/View action. Rendered by the block header so it shares a row
 * with the block title rather than sitting above the entries.
 */
export function RankingHeaderActions({ state }: Props) {
  const { periodState, periodLabel, hasMySubmission, isSaving, openRankingCompose } = state;

  return (
    <>
      {periodLabel ? (
        <span className="flex min-w-0 shrink-0 items-center gap-1.5 text-metadata text-grey-04">
          {getRankingPeriodIcon(periodState)}
          {periodLabel}
        </span>
      ) : null}
      {hasMySubmission ? (
        <Button
          variant="secondary"
          className="h-8 shrink-0 !rounded-full !border-text !bg-white !px-3 text-[16px] whitespace-nowrap !text-text"
          icon={<RankingChart />}
          disabled={isSaving}
          onClick={() => void openRankingCompose('view')}
        >
          View
        </Button>
      ) : (
        <Button
          variant="primary"
          className="h-8 shrink-0 !rounded-full border-grey-02 bg-text !px-3 text-[16px] whitespace-nowrap text-white hover:bg-text/90 focus-visible:border-text focus-visible:shadow-inner-text"
          icon={<RankingChart color="white" />}
          disabled={isSaving}
          onClick={() => void openRankingCompose('edit')}
        >
          Vote
        </Button>
      )}
    </>
  );
}
