'use client';

import * as React from 'react';

import cx from 'classnames';

import type { AggregatedRankingSubmitterRef } from '~/core/blocks/ranking/ranking-block-relations';
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

type SharedHeaderProps = {
  isMobile: boolean;
  displayName: string;
  periodState: RankingPeriodState;
  periodLabel: string | null;
  hasRankedByOthers: boolean;
  submissions: RankingSubmissionRecord[];
  aggregatedSubmitterRefs: AggregatedRankingSubmitterRef[];
  aggregatedSubmitterSpaceIds: string[];
  aggregatedRankingCount: number;
  onBack: () => void;
  showPublishButton?: boolean;
  canPublish?: boolean;
  isSaving?: boolean;
  onPublish?: () => void;
};

type PinnedToolbarProps = Pick<
  SharedHeaderProps,
  'isMobile' | 'onBack' | 'showPublishButton' | 'canPublish' | 'isSaving' | 'onPublish'
>;

export function RankingComposePinnedToolbar({
  isMobile,
  onBack,
  showPublishButton = false,
  canPublish = false,
  isSaving = false,
  onPublish,
}: PinnedToolbarProps) {
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
  );
}

type TitleMetadataProps = Pick<SharedHeaderProps, 'isMobile' | 'displayName'> &
  Partial<
    Pick<
      SharedHeaderProps,
      | 'periodState'
      | 'periodLabel'
      | 'hasRankedByOthers'
      | 'submissions'
      | 'aggregatedSubmitterRefs'
      | 'aggregatedSubmitterSpaceIds'
      | 'aggregatedRankingCount'
    >
  > & {
    showMetadata?: boolean;
  };

export function RankingComposeTitleMetadata({
  isMobile,
  displayName,
  showMetadata = true,
  periodState,
  periodLabel,
  hasRankedByOthers = false,
  submissions = [],
  aggregatedSubmitterRefs = [],
  aggregatedSubmitterSpaceIds = [],
  aggregatedRankingCount = 0,
}: TitleMetadataProps) {
  return (
    <div className="flex flex-col gap-3">
      <Text
        variant="largeTitle"
        className={cx('!leading-[1.3]', !isMobile && '!text-[44px]')}
        ellipsize={!isMobile}
        aria-label={displayName}
      >
        {displayName}
      </Text>
      {showMetadata && periodState && (periodLabel || hasRankedByOthers) ? (
        <RankingPeriodMetadata
          className={isMobile ? undefined : 'mt-0'}
          periodState={periodState}
          periodLabel={periodLabel ?? null}
          hasRankedByOthers={hasRankedByOthers}
          submissions={submissions}
          aggregatedSubmitterRefs={aggregatedSubmitterRefs}
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

export function RankingComposeHeader(props: SharedHeaderProps) {
  return (
    <div className="flex shrink-0 flex-col gap-3">
      <RankingComposePinnedToolbar
        isMobile={props.isMobile}
        onBack={props.onBack}
        showPublishButton={props.showPublishButton}
        canPublish={props.canPublish}
        isSaving={props.isSaving}
        onPublish={props.onPublish}
      />
      <RankingComposeTitleMetadata
        isMobile={props.isMobile}
        displayName={props.displayName}
        periodState={props.periodState}
        periodLabel={props.periodLabel}
        hasRankedByOthers={props.hasRankedByOthers}
        submissions={props.submissions}
        aggregatedSubmitterRefs={props.aggregatedSubmitterRefs}
        aggregatedSubmitterSpaceIds={props.aggregatedSubmitterSpaceIds}
        aggregatedRankingCount={props.aggregatedRankingCount}
      />
    </div>
  );
}
