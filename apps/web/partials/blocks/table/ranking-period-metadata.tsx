'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';

import type { RankingPeriodState } from '~/core/blocks/ranking/ranking-period';
import type { RankingSubmissionRecord } from '~/core/blocks/ranking/ranking-submission-types';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';
import { FallbackImage } from '~/design-system/fallback-image';
import { Stars } from '~/design-system/icons/stars';
import { Time } from '~/design-system/icons/time';

const VISIBLE_RANKED_BY_AVATARS = 3;
const RANKED_BY_AVATAR_SIZE = 20;
const RANKED_BY_ROW_CLASS = 'inline-flex min-w-0 shrink-0 flex-nowrap items-center gap-[8px]';

function dedupePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter(id => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function preferAvatarsFirst<T>(items: T[], hasAvatar: (item: T) => boolean): T[] {
  return items
    .map((item, index) => ({ item, index, hasAvatar: hasAvatar(item) }))
    .sort((a, b) => {
      if (a.hasAvatar !== b.hasAvatar) return a.hasAvatar ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export function getRankingPeriodIcon(state: RankingPeriodState) {
  return state === 'not-started' ? <Stars color="grey-04" /> : <Time color="grey-04" />;
}

type RankingRankedByAvatar = {
  key: string;
  avatarUrl: string | null;
  fallbackSeed: string;
};

function RankingRankedByAvatarGroup({
  avatars,
  extraCount = 0,
}: {
  avatars: RankingRankedByAvatar[];
  extraCount?: number;
}) {
  if (avatars.length === 0 && extraCount <= 0) return null;

  return (
    <AvatarGroup>
      {avatars.map(avatar => (
        <AvatarGroup.Item key={avatar.key} size={20}>
          {avatar.avatarUrl ? (
            <FallbackImage value={avatar.avatarUrl} sizes={`${RANKED_BY_AVATAR_SIZE}px`} className="object-cover" />
          ) : (
            <Avatar size={RANKED_BY_AVATAR_SIZE} value={avatar.fallbackSeed} />
          )}
        </AvatarGroup.Item>
      ))}
      {extraCount > 0 ? (
        <li
          key="extra-count"
          className="relative box-content flex h-5 shrink-0 list-none items-center justify-center rounded-full border-2 border-white bg-grey-02 px-1.5 text-[11px] text-grey-04 tabular-nums"
        >
          <span className="block h-5 leading-[20px]">+{extraCount}</span>
        </li>
      ) : null}
    </AvatarGroup>
  );
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
  const uniqueSpaceIds = React.useMemo(() => dedupePreserveOrder(submitterSpaceIds), [submitterSpaceIds]);
  const { data: profilesBySpaceId = new Map() } = useQuery({
    queryKey: ['ranking-submitter-profiles', uniqueSpaceIds],
    enabled: uniqueSpaceIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const profiles = await Effect.runPromise(fetchProfilesBySpaceIds(uniqueSpaceIds));
      return new Map(uniqueSpaceIds.map((spaceId, index) => [spaceId, profiles[index]!]));
    },
  });
  const { spacesById } = useSpacesByIds(uniqueSpaceIds);

  const uniqueCount = uniqueSpaceIds.length;
  const count = totalCount ?? uniqueCount;

  if (count === 0 && uniqueCount === 0) return null;

  const visibleSpaceIds = React.useMemo(() => {
    const ranked = preferAvatarsFirst(uniqueSpaceIds, spaceId => {
      const profile = profilesBySpaceId.get(spaceId);
      const profileAvatarUrl =
        profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;
      const spaceImage = spacesById.get(spaceId)?.entity.image;
      const spaceAvatarUrl = spaceImage && spaceImage !== PLACEHOLDER_SPACE_IMAGE ? spaceImage : null;
      return Boolean(profileAvatarUrl ?? spaceAvatarUrl);
    });
    return ranked.slice(0, maxVisible);
  }, [uniqueSpaceIds, profilesBySpaceId, spacesById, maxVisible]);

  const extraCount = Math.max(uniqueCount - visibleSpaceIds.length, 0);

  const avatars: RankingRankedByAvatar[] = visibleSpaceIds.map(spaceId => {
    const profile = profilesBySpaceId.get(spaceId);
    const profileAvatarUrl =
      profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;
    const spaceImage = spacesById.get(spaceId)?.entity.image;
    const spaceAvatarUrl = spaceImage && spaceImage !== PLACEHOLDER_SPACE_IMAGE ? spaceImage : null;
    return {
      key: spaceId,
      avatarUrl: profileAvatarUrl ?? spaceAvatarUrl,
      fallbackSeed: profile?.address ?? spaceId,
    };
  });

  return <RankingRankedByAvatarGroup avatars={avatars} extraCount={extraCount} />;
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
    const visible = preferAvatarsFirst(submissions, submission => Boolean(submission.author.avatarUrl)).slice(
      0,
      VISIBLE_RANKED_BY_AVATARS
    );
    const extraCount = Math.max(submissions.length - visible.length, 0);

    return (
      <span className={RANKED_BY_ROW_CLASS}>
        <span className="shrink-0 text-grey-04">Ranked by</span>
        <RankingRankedByAvatarGroup
          avatars={visible.map(submission => ({
            key: submission.authorSpaceId,
            avatarUrl: submission.author.avatarUrl,
            fallbackSeed: submission.author.address,
          }))}
          extraCount={extraCount}
        />
      </span>
    );
  }

  if (aggregatedSubmitterSpaceIds.length > 0 || aggregatedRankingCount > 0) {
    return (
      <span className={RANKED_BY_ROW_CLASS}>
        <span className="shrink-0 text-grey-04">Ranked by</span>
        <RankingAggregatedSubmitterAvatars
          submitterSpaceIds={aggregatedSubmitterSpaceIds}
          totalCount={aggregatedRankingCount || aggregatedSubmitterSpaceIds.length}
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
  const showRankedBy = hasRankedByOthers;
  const showPeriod = Boolean(periodLabel);

  return (
    <div className={cx(className, 'flex w-full min-w-0 flex-nowrap items-center gap-x-4 text-metadata text-grey-04')}>
      {showRankedBy ? (
        <RankingRankedBy
          submissions={submissions}
          aggregatedSubmitterSpaceIds={aggregatedSubmitterSpaceIds}
          aggregatedRankingCount={aggregatedRankingCount}
        />
      ) : null}
      {showPeriod ? (
        <span className="flex min-w-0 shrink-0 items-center gap-1.5">
          {periodIcon}
          {periodLabel}
        </span>
      ) : null}
      {trailing}
    </div>
  );
}
