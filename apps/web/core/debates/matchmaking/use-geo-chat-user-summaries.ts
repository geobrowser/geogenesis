'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { personalSpacesByPageIdsQueryKey } from '~/core/io/query-keys';
import { fetchPersonalSpacesByPageIds } from '~/core/io/subgraph/fetch-personal-spaces-by-page-ids';
import { normId } from '~/core/utils/norm-id';

import type { DebateParticipantSummary } from '../api';

/**
 * Names, faces and profile spaces for geo-chat user ids, from the graph.
 *
 * geo-chat sends a scheduled request's participants as bare ids, and the online roster only knows
 * people who are online — whoever invited you usually is not. The id is their personal space's
 * page entity, so the graph can say which space that is, and the profile batch loader does the
 * rest.
 */
export function useGeoChatUserSummaries(userIds: string[], enabled: boolean): DebateParticipantSummary[] {
  const ids = React.useMemo(() => [...new Set(userIds.map(normId))].sort(), [userIds]);

  const spaces = useQuery({
    queryKey: personalSpacesByPageIdsQueryKey(ids),
    queryFn: () => fetchPersonalSpacesByPageIds(ids),
    enabled: enabled && ids.length > 0,
    // Which space a person fronts does not change under them.
    staleTime: 10 * 60_000,
  });

  const spaceIds = React.useMemo(() => [...(spaces.data?.values() ?? [])], [spaces.data]);
  const { profilesBySpaceId } = useProfilesBySpaceIds(spaceIds, enabled);

  return React.useMemo(() => {
    const summaries: DebateParticipantSummary[] = [];
    for (const [userId, spaceId] of spaces.data ?? []) {
      const profile = profilesBySpaceId.get(spaceId);
      summaries.push({
        user_id: userId,
        profile_space_id: spaceId,
        display_name: profile?.name ?? null,
        avatar_cid: profile?.avatarUrl ?? null,
      });
    }
    return summaries;
  }, [profilesBySpaceId, spaces.data]);
}
