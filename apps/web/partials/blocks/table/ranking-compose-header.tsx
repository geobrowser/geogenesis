'use client';

import * as React from 'react';

import cx from 'classnames';

import { RANKING_POINTS_UI_ENABLED } from '~/core/blocks/ranking/ranking-points';
import type { RankingSubmissionRecord } from '~/core/blocks/ranking/ranking-submission-types';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';
import { Button } from '~/design-system/button';
import { FallbackImage } from '~/design-system/fallback-image';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Text } from '~/design-system/text';

export const COMPOSE_ICON_BUTTON_CLASS =
  'shrink-0 !gap-0 !rounded-sm !border-0 !p-0 !shadow-none min-w-0 hover:!shadow-none';

function RankingComposeAggregatedCount({ count }: { count: number }) {
  return (
    <span className="text-grey-04">
      {count} {count === 1 ? 'ranking' : 'rankings'} submitted
    </span>
  );
}

function RankingComposeRankedBy({ submissions }: { submissions: RankingSubmissionRecord[] }) {
  const visible = submissions.slice(0, 3);
  const extraCount = Math.max(submissions.length - visible.length, 0);

  if (submissions.length === 0) {
    return null;
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="shrink-0 text-grey-04">Ranked by</span>
      <AvatarGroup>
        {visible.map(submission => (
          <AvatarGroup.Item key={submission.authorSpaceId}>
            {submission.author.avatarUrl ? (
              <FallbackImage value={submission.author.avatarUrl} sizes="24px" className="object-cover" />
            ) : (
              <Avatar size={24} value={submission.author.address} />
            )}
          </AvatarGroup.Item>
        ))}
      </AvatarGroup>
      {extraCount > 0 ? (
        <span className="shrink-0 rounded-full bg-grey-01 px-1.5 py-0.5 text-metadata text-grey-04">+{extraCount}</span>
      ) : null}
    </span>
  );
}

type Props = {
  isMobile: boolean;
  displayName: string;
  periodLabel: string | null;
  periodIcon: React.ReactNode;
  submissions: RankingSubmissionRecord[];
  aggregatedRankingCount: number;
  onBack: () => void;
};

export function RankingComposeHeader({
  isMobile,
  displayName,
  periodLabel,
  periodIcon,
  submissions,
  aggregatedRankingCount,
  onBack,
}: Props) {
  return (
    <div className="flex shrink-0 flex-col gap-3">
      <Button
        type="button"
        variant="ghost"
        icon={<ArrowLeft color="grey-04" />}
        onClick={onBack}
        className={cx(COMPOSE_ICON_BUTTON_CLASS, 'h-7 w-7 hover:!bg-grey-01')}
        aria-label="Exit ranking editor"
      />
      <Text variant="largeTitle" ellipsize={!isMobile} aria-label={displayName}>
        {displayName}
      </Text>
      {isMobile && (periodLabel || submissions.length > 0 || aggregatedRankingCount > 0) ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-metadata text-grey-04">
          {submissions.length > 0 ? (
            <RankingComposeRankedBy submissions={submissions} />
          ) : aggregatedRankingCount > 0 ? (
            <RankingComposeAggregatedCount count={aggregatedRankingCount} />
          ) : null}
          {periodLabel ? (
            <span className="flex items-center gap-1.5">
              {periodIcon}
              {periodLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {!isMobile && periodLabel ? (
        <div className="flex flex-wrap items-center gap-3 text-metadata text-grey-04">
          <span className="flex items-center gap-1.5">
            {periodIcon}
            {periodLabel}
          </span>
          {RANKING_POINTS_UI_ENABLED ? <span className="text-purple">Earn 10 points</span> : null}
        </div>
      ) : null}
    </div>
  );
}
