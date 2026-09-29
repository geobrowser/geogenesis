'use client';

import { IdUtils } from '@geoprotocol/geo-sdk/lite';
import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import type { DebateParticipant } from '~/core/debates/api';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { validateSpaceId } from '~/core/io/rest/validation';

import { type ParticipantProfile, fetchParticipantProfile } from './participant-profile';

type ParticipantLike = Pick<DebateParticipant, 'profile_space_id'>;

/** Resolve video-only profile fields after the shared personal-space profile batch. */
export function useParticipantProfiles(
  participants: readonly (ParticipantLike | null | undefined)[],
  enabled = true
): Map<string, ParticipantProfile> {
  const spaceIds = React.useMemo(
    () => [
      ...new Set(
        participants.flatMap(participant => {
          const spaceId = participant?.profile_space_id;
          const normalized = spaceId ? validateSpaceId(spaceId) : null;
          return normalized ? [normalized] : [];
        })
      ),
    ],
    [participants]
  );
  const { profilesBySpaceId } = useProfilesBySpaceIds(spaceIds, enabled && spaceIds.length > 0);

  // Stable by contract: react-query re-runs `combine` whenever its identity changes, and a fresh
  // Map is not structurally shared for us. This follows `useProfilesBySpaceIds`, whose result feeds
  // the query fan-out here.
  const combine = React.useCallback(
    (profiles: UseQueryResult<ParticipantProfile>[]) => {
      const bySpaceId = new Map<string, ParticipantProfile>();

      profiles.forEach((profile, index) => {
        const spaceId = spaceIds[index];
        if (!spaceId || !profile.data) return;

        bySpaceId.set(spaceId, profile.data);
      });

      return bySpaceId;
    },
    [spaceIds]
  );

  return useQueries({
    queries: spaceIds.map(spaceId => {
      const profile = profilesBySpaceId.get(spaceId);
      const personEntityId =
        profile && validateSpaceId(profile.id) !== validateSpaceId(profile.spaceId) && IdUtils.isValid(profile.id)
          ? profile.id
          : null;

      return {
        queryKey: ['debate-participant-profile', personEntityId, spaceId],
        queryFn: () => fetchParticipantProfile(personEntityId as string, spaceId),
        enabled: enabled && personEntityId !== null,
        staleTime: 60_000,
      };
    }),
    combine,
  });
}
