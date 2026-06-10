'use client';

import * as React from 'react';

import cx from 'classnames';

import type { RankingPeriodState } from '~/core/blocks/ranking/ranking-period';
import { RANKING_POINTS_UI_ENABLED } from '~/core/blocks/ranking/ranking-points';
import type { RankingSubmissionRecord } from '~/core/blocks/ranking/ranking-submission-types';

import { Button } from '~/design-system/button';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Text } from '~/design-system/text';

import { RankingPeriodMetadata } from './ranking-period-metadata';

export const COMPOSE_ICON_BUTTON_CLASS =
  'shrink-0 !gap-0 !rounded-sm !border-0 !p-0 !shadow-none min-w-0 hover:!shadow-none';

export const RANKING_COMPOSE_PUBLISH_BUTTON_CLASS =
  'h-8 !rounded-full border-grey-02 bg-text px-3 text-[16px] whitespace-nowrap text-white hover:bg-text/90 focus-visible:border-text focus-visible:shadow-inner-text disabled:!cursor-not-allowed disabled:!bg-divider disabled:!text-grey-03 disabled:hover:!bg-divider';

type Props = {
  isMobile: boolean;
  displayName: string;
  periodState: RankingPeriodState;
  periodLabel: string | null;
  hasRankedByOthers: boolean;
  submissions: RankingSubmissionRecord[];
  aggregatedSubmitterSpaceIds: string[];
  aggregatedRankingCount: number;
  onBack: () => void;
  showPublishButton?: boolean;
  canPublish?: boolean;
  isSaving?: boolean;
  onPublish?: () => void;
};

export function RankingComposeHeader({
  isMobile,
  displayName,
  periodState,
  periodLabel,
  hasRankedByOthers,
  submissions,
  aggregatedSubmitterSpaceIds,
  aggregatedRankingCount,
  onBack,
  showPublishButton = false,
  canPublish = false,
  isSaving = false,
  onPublish,
}: Props) {
  const mobilePublishButton =
    isMobile && showPublishButton ? (
      <Button
        variant="primary"
        className={cx(RANKING_COMPOSE_PUBLISH_BUTTON_CLASS, 'shrink-0')}
        disabled={!canPublish}
        onClick={onPublish}
      >
        {isSaving ? 'Publishing…' : 'Publish ranking'}
      </Button>
    ) : null;

  return (
    <div className="flex shrink-0 flex-col gap-3">
      <div className={cx('flex items-center', isMobile && showPublishButton && 'h-8 justify-between gap-3')}>
        <Button
          type="button"
          variant="ghost"
          icon={<ArrowLeft color="grey-04" />}
          onClick={onBack}
          className={cx(
            COMPOSE_ICON_BUTTON_CLASS,
            'shrink-0 hover:!bg-grey-01',
            isMobile && showPublishButton ? 'h-8 w-8' : 'h-7 w-7'
          )}
          aria-label="Exit ranking editor"
        />
        {mobilePublishButton}
      </div>
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
          aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
          aggregatedRankingCount={aggregatedRankingCount}
          trailing={
            !isMobile && RANKING_POINTS_UI_ENABLED ? <span className="text-purple">Earn 10 points</span> : undefined
          }
        />
      ) : null}
    </div>
  );
}
