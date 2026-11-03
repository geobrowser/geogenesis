'use client';

import * as React from 'react';

import { usePersonalSpacesByPageIds } from '~/core/hooks/use-personal-spaces-by-page-ids';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { validateSpaceId } from '~/core/io/rest/validation';
import { normId } from '~/core/utils/norm-id';

import type { DebateParticipantSummary } from '../api';

/** A person as geo-chat sends them. Older geo-chat sends only `user_id`. */
export type GeoChatPersonRef = {
  user_id: string;
  profile_space_id?: string | null;
  display_name?: string | null;
  avatar_cid?: string | null;
};

/**
 * Names, faces and profile spaces for the people geo-chat names, keyed by `user_id`.
 *
 * geo-chat sends each person's `profile_space_id`, and names where it has them; the graph profile
 * fills in what is missing. A user id is not a graph id, so it is only looked up as a page entity
 * for a row with no `profile_space_id`, from a geo-chat that predates it.
 */
export function useGeoChatUserSummaries(people: readonly GeoChatPersonRef[], enabled: boolean) {
  const { withSpace, bareIds } = React.useMemo(() => {
    const seen = new Set<string>();
    const withSpace: Array<GeoChatPersonRef & { profile_space_id: string }> = [];
    const bareIds: string[] = [];
    for (const person of people) {
      const key = normId(person.user_id);
      if (seen.has(key)) continue;
      seen.add(key);
      const spaceId = person.profile_space_id ? validateSpaceId(person.profile_space_id) : null;
      if (spaceId) withSpace.push({ ...person, profile_space_id: spaceId });
      else bareIds.push(person.user_id);
    }
    return { withSpace, bareIds };
  }, [people]);

  const fallback = usePersonalSpacesByPageIds(bareIds, enabled && bareIds.length > 0);

  const spaceIds = React.useMemo(
    () => [...new Set([...withSpace.map(person => person.profile_space_id), ...(fallback.data?.values() ?? [])])],
    [fallback.data, withSpace]
  );
  const { profilesBySpaceId, isLoading: profilesLoading } = useProfilesBySpaceIds(spaceIds, enabled);

  return React.useMemo(() => {
    const summaries: DebateParticipantSummary[] = [];
    const add = (person: GeoChatPersonRef, spaceId: string) => {
      const profile = profilesBySpaceId.get(spaceId);
      const displayName = person.display_name?.trim() || profile?.name || null;
      // Held back while their profile loads, so a nameless summary cannot displace the roster's
      // entry for someone online. Once profiles settle without one they are emitted anyway.
      if (!displayName && !profile && profilesLoading) return;
      summaries.push({
        user_id: person.user_id,
        profile_space_id: spaceId,
        // Empty is absent: the profile schema allows ''.
        display_name: displayName,
        avatar_cid: person.avatar_cid || profile?.avatarUrl || null,
      });
    };
    for (const person of withSpace) add(person, person.profile_space_id);
    for (const [userId, spaceId] of fallback.data ?? []) add({ user_id: userId }, spaceId);
    return summaries;
  }, [fallback.data, profilesBySpaceId, profilesLoading, withSpace]);
}
