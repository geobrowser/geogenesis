'use client';

import cx from 'classnames';

import { useFollowedInterests } from '~/core/topics/use-followed-topics';

import { FollowerCount } from './follow-control';
import { useFollowerCount, useFollowers } from './use-follower-count';

/** How many follow this person, by their personal space id; see `useFollowerCount`. */
export function usePersonFollowerCount(spaceId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useFollowerCount(spaceId, { kind: 'person', enabled });
}

/** Who follows this person, as personal space ids, with the count; see `useFollowers`. */
export function usePersonFollowers(spaceId: string) {
  return useFollowers(spaceId, { kind: 'person' });
}

/**
 * How many this person follows: every Interested they hold, so the people and the topics alike
 * (GEO-3236). `null` while loading.
 */
export function usePersonFollowingCount(spaceId: string): number | null {
  const { ids, isLoading } = useFollowedInterests(spaceId);
  return isLoading ? null : ids.size;
}

/**
 * "42 followers · 18 following" under a profile's tagline, on the page and in the side panel. Each
 * half is left out at zero, and the line with it when both are, once both are known.
 */
export function PersonFollowCounts({ spaceId, className }: { spaceId: string; className?: string }) {
  const followers = usePersonFollowerCount(spaceId);
  const following = usePersonFollowingCount(spaceId);
  // Holds its line while either count loads, so the profile under it doesn't jump when it fills in.
  if (followers === null || following === null) return <p aria-hidden className={cx('m-0 h-5', className)} />;
  if (!followers && !following) return null;

  return (
    <p className={cx('m-0 flex flex-wrap items-center text-metadata text-grey-04', className)}>
      <FollowerCount count={followers} kind="person" numberClassName="text-text" />
      {followers && following ? (
        <span aria-hidden className="mx-1.5 text-[#2A2B2E]">
          ·
        </span>
      ) : null}
      {following ? (
        <span className="shrink-0 whitespace-nowrap">
          <span className="text-text tabular-nums">{following.toLocaleString('en-US')}</span> following
        </span>
      ) : null}
    </p>
  );
}
