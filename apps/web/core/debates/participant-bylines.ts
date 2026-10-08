'use client';

import { IdUtils } from '@geoprotocol/geo-sdk/lite';
import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import type { DebateParticipant } from '~/core/debates/api';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { validateSpaceId } from '~/core/io/rest/validation';
import {
  type ProfileHistory,
  fetchProfileHistory,
  profileHistoryQueryKey,
} from '~/core/io/subgraph/fetch-profile-history';
import { currentAffiliation } from '~/core/profile/profile-summary';

type ParticipantLike = Pick<DebateParticipant, 'profile_space_id'>;

/**
 * Resolve the one-line byline shown beneath each recorded-debate participant's name.
 *
 * Debate rows carry a personal-space id, while profile history hangs off the person's entity. The
 * profile batch is therefore the necessary first hop. The history queries keep their profile-page
 * cache keys, so opening a participant's profile after watching them reuses the same response.
 *
 * Tagline first, then a current affiliation, then the description. The order is by how
 * deliberate each one is: a tagline is the line the person wrote to be read under their name, an
 * affiliation is derived from their Work and Education records, and a description is prose
 * written for a profile page that happens to fit on one line.
 */
export function useParticipantBylines(
  participants: readonly (ParticipantLike | null | undefined)[],
  enabled = true
): Map<string, string> {
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
    (histories: UseQueryResult<ProfileHistory>[]) => {
      const bySpaceId = new Map<string, string>();

      histories.forEach((history, index) => {
        const spaceId = spaceIds[index];
        if (!spaceId || !history.data) return;

        const line =
          history.data.tagline ??
          currentAffiliation(history.data.employment, history.data.education) ??
          history.data.description;
        if (line) bySpaceId.set(spaceId, line);
      });

      return bySpaceId;
    },
    [spaceIds]
  );

  return useQueries({
    queries: spaceIds.map(spaceId => {
      const profile = profilesBySpaceId.get(spaceId);
      const personEntityId =
        profile && profile.id !== profile.spaceId && IdUtils.isValid(profile.id) ? profile.id : null;

      return {
        queryKey: profileHistoryQueryKey(personEntityId ?? undefined, spaceId),
        queryFn: () => fetchProfileHistory(personEntityId as string, spaceId),
        enabled: enabled && personEntityId !== null,
        staleTime: 60_000,
      };
    }),
    combine,
  });
}
