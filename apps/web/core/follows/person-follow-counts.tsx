'use client';

import { useFollowerCount, useFollowers } from './use-follower-count';

/** How many follow this person, by their personal space id; see `useFollowerCount`. */
export function usePersonFollowerCount(spaceId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useFollowerCount(spaceId, { kind: 'person', enabled });
}

/** Who follows this person, as personal space ids, with the count; see `useFollowers`. */
export function usePersonFollowers(spaceId: string) {
  return useFollowers(spaceId, { kind: 'person' });
}
