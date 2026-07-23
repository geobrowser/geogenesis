'use client';

import { Button } from '~/design-system/button';

import { getRankingPeriodIcon } from './ranking-period-metadata';
import type { RankingBlockState } from './use-ranking-block-state';

type Props = {
  state: RankingBlockState;
};

const ACTION_BUTTON_CLASS =
  'h-7 shrink-0 !gap-0 !rounded-full !px-2.5 !py-0 !text-[16px] !leading-[13px] font-normal tracking-[-0.35px] whitespace-nowrap !shadow-none focus-visible:!border-text focus-visible:!shadow-inner-text disabled:!border-transparent disabled:!bg-divider disabled:!text-grey-03';

/**
 * Period label + Rank/View action. Rendered by the block header so it shares a row
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
          className={`${ACTION_BUTTON_CLASS} !border-grey-02 !bg-white !text-text hover:!border-grey-02 hover:!bg-white`}
          disabled={isSaving}
          onClick={() => void openRankingCompose('view')}
        >
          View
        </Button>
      ) : (
        <Button
          variant="primary"
          className={`${ACTION_BUTTON_CLASS} !border-transparent !bg-[#151515] !text-white hover:!bg-[#151515]`}
          disabled={isSaving}
          onClick={() => void openRankingCompose('edit')}
        >
          Rank
        </Button>
      )}
    </>
  );
}
