'use client';

import { IdUtils } from '@geoprotocol/geo-sdk/lite';
import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import type { DebateParticipant } from '~/core/debates/api';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { fetchProfileHistory, profileHistoryQueryKey } from '~/core/io/subgraph/fetch-profile-history';
import { currentAffiliation } from '~/core/profile/profile-summary';

type ParticipantLike = Pick<DebateParticipant, 'profile_space_id'>;

/**
 * Resolve the one-line affiliation shown beneath each recorded-debate participant's name.
 *
 * Debate rows carry a personal-space id, while profile history hangs off the person's entity. The
 * profile batch is therefore the necessary first hop. The history queries keep their profile-page
 * cache keys, so opening a participant's profile after watching them reuses the same response.
 */
export function useParticipantAffiliations(
  participants: readonly (ParticipantLike | null | undefined)[],
  enabled = true
): Map<string, string> {
  const spaceIds = React.useMemo(
    () => [...new Set(participants.flatMap(participant => participant?.profile_space_id || []))],
    [participants]
  );
  const { profilesBySpaceId } = useProfilesBySpaceIds(spaceIds, enabled && spaceIds.length > 0);

  const histories = useQueries({
    queries: spaceIds.map(spaceId => {
      const profile = profilesBySpaceId.get(spaceId);
      const personEntityId = profile && profile.id !== profile.spaceId && IdUtils.isValid(profile.id) ? profile.id : null;

      return {
        queryKey: profileHistoryQueryKey(personEntityId ?? undefined, spaceId),
        queryFn: () => fetchProfileHistory(personEntityId as string, spaceId),
        enabled: enabled && personEntityId !== null,
        staleTime: 60_000,
      };
    }),
  });

  return React.useMemo(() => {
    const bySpaceId = new Map<string, string>();

    histories.forEach((history, index) => {
      const spaceId = spaceIds[index];
      if (!spaceId || !history.data) return;

      const line = currentAffiliation(history.data.employment, history.data.education);
      if (line) bySpaceId.set(spaceId, line);
    });

    return bySpaceId;
  }, [histories, spaceIds]);
}
