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
  const { profilesBySpaceId, isLoading: profilesLoading } = useProfilesBySpaceIds(spaceIds, enabled);

  return React.useMemo(() => {
    const summaries: DebateParticipantSummary[] = [];
    for (const [userId, spaceId] of spaces.data ?? []) {
      const profile = profilesBySpaceId.get(spaceId);
      // Held back while their profile loads: a summary with no name yet reads as the raw space id,
      // and would displace the roster's entry for someone online. Once profiles settle without one
      // — the batch loader can reject — they are emitted anyway, so they keep their profile link.
      if (!profile && profilesLoading) continue;
      summaries.push({
        user_id: userId,
        profile_space_id: spaceId,
        // Empty is absent: the profile schema allows '', and nothing downstream should have to care.
        display_name: profile?.name || null,
        avatar_cid: profile?.avatarUrl || null,
      });
    }
    return summaries;
  }, [profilesBySpaceId, profilesLoading, spaces.data]);
}
