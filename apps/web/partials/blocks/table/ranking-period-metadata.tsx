'use client';

import * as React from 'react';

import type { RankingPeriodState } from '~/core/blocks/ranking/ranking-period';
import type { RankingSubmissionRecord } from '~/core/blocks/ranking/ranking-submission-types';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';
import { FallbackImage } from '~/design-system/fallback-image';
import { Stars } from '~/design-system/icons/stars';
import { Time } from '~/design-system/icons/time';

const VISIBLE_RANKED_BY_AVATARS = 2;

export function getRankingPeriodIcon(state: RankingPeriodState) {
  return state === 'not-started' ? <Stars color="grey-04" /> : <Time color="grey-04" />;
}

export function RankingRankedBy({
  submissions,
  aggregatedRankingEntityIds = [],
}: {
  submissions: RankingSubmissionRecord[];
  aggregatedRankingEntityIds?: string[];
}) {
  if (submissions.length > 0) {
    const visible = submissions.slice(0, VISIBLE_RANKED_BY_AVATARS);
    const extraCount = Math.max(submissions.length - visible.length, 0);

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
          <span className="shrink-0 rounded-full bg-grey-01 px-1.5 py-0.5 text-metadata text-grey-04">
            +{extraCount}
          </span>
        ) : null}
      </span>
    );
  }

  if (aggregatedRankingEntityIds.length > 0) {
    const visible = aggregatedRankingEntityIds.slice(0, VISIBLE_RANKED_BY_AVATARS);
    const extraCount = Math.max(aggregatedRankingEntityIds.length - visible.length, 0);

    return (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0 text-grey-04">Ranked by</span>
        <AvatarGroup>
          {visible.map(rankingEntityId => (
            <AvatarGroup.Item key={rankingEntityId}>
              <Avatar size={24} value={rankingEntityId} />
            </AvatarGroup.Item>
          ))}
        </AvatarGroup>
        {extraCount > 0 ? (
          <span className="shrink-0 rounded-full bg-grey-01 px-1.5 py-0.5 text-metadata text-grey-04">
            +{extraCount}
          </span>
        ) : null}
      </span>
    );
  }

  return null;
}

type RankingPeriodMetadataProps = {
  periodState: RankingPeriodState;
  periodLabel: string | null;
  hasRankedByOthers: boolean;
  submissions: RankingSubmissionRecord[];
  aggregatedRankingEntityIds?: string[];
  trailing?: React.ReactNode;
  className?: string;
};

export function RankingPeriodMetadata({
  periodState,
  periodLabel,
  hasRankedByOthers,
  submissions,
  aggregatedRankingEntityIds = [],
  trailing,
  className = 'mt-1',
}: RankingPeriodMetadataProps) {
  if (!periodLabel && !hasRankedByOthers) return null;

  const periodIcon = getRankingPeriodIcon(periodState);

  return (
    <div className={`${className} flex flex-wrap items-center gap-x-4 gap-y-2 text-metadata text-grey-04`}>
      {hasRankedByOthers ? (
        <RankingRankedBy submissions={submissions} aggregatedRankingEntityIds={aggregatedRankingEntityIds} />
      ) : null}
      {periodLabel ? (
        <span className="flex items-center gap-1.5">
          {periodIcon}
          {periodLabel}
        </span>
      ) : null}
      {trailing}
    </div>
  );
}
