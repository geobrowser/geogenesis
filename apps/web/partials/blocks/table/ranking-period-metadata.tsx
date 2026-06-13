'use client';

import * as React from 'react';

import type { RankingPeriodState } from '~/core/blocks/ranking/ranking-period';
import type { RankingSubmissionRecord } from '~/core/blocks/ranking/ranking-submission-types';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';
import { FallbackImage } from '~/design-system/fallback-image';
import { Stars } from '~/design-system/icons/stars';
import { Time } from '~/design-system/icons/time';

const VISIBLE_RANKED_BY_AVATARS = 2;

export function getRankingPeriodIcon(state: RankingPeriodState) {
  return state === 'not-started' ? <Stars color="grey-04" /> : <Time color="grey-04" />;
}

export function RankingAggregatedSubmitterAvatars({
  submitterSpaceIds,
  totalCount,
  maxVisible = VISIBLE_RANKED_BY_AVATARS,
}: {
  submitterSpaceIds: string[];
  totalCount?: number;
  maxVisible?: number;
}) {
  const count = totalCount ?? submitterSpaceIds.length;
  const visibleSpaceIds = submitterSpaceIds.slice(0, maxVisible);
  const { spacesById } = useSpacesByIds(visibleSpaceIds);

  if (count === 0) return null;

  const extraCount = Math.max(count - visibleSpaceIds.length, 0);

  return (
    <>
      <AvatarGroup>
        {visibleSpaceIds.map(spaceId => {
          const space = spacesById.get(spaceId);
          const image = space?.entity.image;
          return (
            <AvatarGroup.Item key={spaceId}>
              {image ? (
                <FallbackImage value={image} sizes="24px" className="object-cover" />
              ) : (
                <Avatar size={24} value={spaceId} />
              )}
            </AvatarGroup.Item>
          );
        })}
      </AvatarGroup>
      {extraCount > 0 ? (
        <span className="shrink-0 rounded-full bg-grey-01 px-1.5 py-0.5 text-metadata text-grey-04">+{extraCount}</span>
      ) : null}
    </>
  );
}

export function RankingRankedBy({
  submissions,
  aggregatedSubmitterSpaceIds = [],
  aggregatedRankingCount = 0,
}: {
  submissions: RankingSubmissionRecord[];
  aggregatedSubmitterSpaceIds?: string[];
  aggregatedRankingCount?: number;
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

  if (aggregatedRankingCount > 0) {
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0 text-grey-04">Ranked by</span>
        <RankingAggregatedSubmitterAvatars
          submitterSpaceIds={aggregatedSubmitterSpaceIds}
          totalCount={aggregatedRankingCount}
        />
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
  aggregatedSubmitterSpaceIds?: string[];
  aggregatedRankingCount?: number;
  trailing?: React.ReactNode;
  className?: string;
};

export function RankingPeriodMetadata({
  periodState,
  periodLabel,
  hasRankedByOthers,
  submissions,
  aggregatedSubmitterSpaceIds = [],
  aggregatedRankingCount = 0,
  trailing,
  className = 'mt-1',
}: RankingPeriodMetadataProps) {
  if (!periodLabel && !hasRankedByOthers) return null;

  const periodIcon = getRankingPeriodIcon(periodState);

  return (
    <div className={`${className} flex flex-wrap items-center gap-x-4 gap-y-2 text-metadata text-grey-04`}>
      {hasRankedByOthers ? (
        <RankingRankedBy
          submissions={submissions}
          aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
          aggregatedRankingCount={aggregatedRankingCount}
        />
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
