'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { personalSpacesByPageIdsQueryKey } from '~/core/io/query-keys';
import { fetchPersonalSpacesByPageIds } from '~/core/io/subgraph/fetch-personal-spaces-by-page-ids';
import {
  type SpaceParticipantProfile,
  useSpaceParticipantsInfinite,
} from '~/core/space-members/use-space-participants-infinite';
import { normId } from '~/core/utils/norm-id';
import { formatShortAddress } from '~/core/utils/utils';

/** Someone as the chat names them: an author, a mention, a mention candidate. */
export type ChatPerson = {
  /** Dashless person entity id, as geo-chat spells `author_id`. */
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Seeds the generated avatar. */
  avatarSeed: string;
  profileLink: string | null;
};

const EMPTY: SpaceParticipantProfile[] = [];

function personFromProfile(
  profile: Pick<SpaceParticipantProfile, 'id' | 'spaceId' | 'name' | 'avatarUrl' | 'address' | 'profileLink'>
): ChatPerson {
  return {
    id: normId(profile.id),
    name: profile.name || (profile.address.startsWith('0x') ? formatShortAddress(profile.address) : 'Anonymous'),
    avatarUrl: profile.avatarUrl,
    avatarSeed: profile.spaceId,
    profileLink: profile.profileLink,
  };
}

/** A person the graph has no profile for yet. */
export function unknownPerson(id: string): ChatPerson {
  return { id: normId(id), name: 'Anonymous', avatarUrl: null, avatarSeed: normId(id), profileLink: null };
}

/**
 * The space's editors and members, first pages of each: the mention candidates, and the people
 * most messages come from. Editors first.
 */
export function useSpaceChatParticipants(spaceId: string, enabled: boolean) {
  const editors = useSpaceParticipantsInfinite({ spaceId, kind: 'editors', enabled });
  const members = useSpaceParticipantsInfinite({ spaceId, kind: 'members', enabled });
  const editorList = editors.participants ?? EMPTY;
  const memberList = members.participants ?? EMPTY;
  return React.useMemo(() => {
    const byId = new Map<string, ChatPerson>();
    for (const profile of [...editorList, ...memberList]) {
      const person = personFromProfile(profile);
      if (!byId.has(person.id)) byId.set(person.id, person);
    }
    return [...byId.values()];
  }, [editorList, memberList]);
}

/**
 * Names and avatars for `ids` (authors and mentions). Participants answer most; anyone else, such
 * as a former member, goes person entity → personal space → profile.
 */
export function useChatPeople(ids: readonly string[], participants: readonly ChatPerson[]): Map<string, ChatPerson> {
  const known = React.useMemo(() => new Map(participants.map(person => [person.id, person])), [participants]);
  const missing = React.useMemo(() => [...new Set(ids.map(normId))].filter(id => !known.has(id)).sort(), [ids, known]);
  const spaces = useQuery({
    queryKey: personalSpacesByPageIdsQueryKey(missing),
    queryFn: () => fetchPersonalSpacesByPageIds(missing),
    enabled: missing.length > 0,
    staleTime: 10 * 60_000,
    // A new author changes the key; the names already shown stay while it loads.
    placeholderData: keepPreviousData,
  });
  const spaceIds = React.useMemo(() => [...(spaces.data?.values() ?? [])], [spaces.data]);
  const { profilesBySpaceId } = useProfilesBySpaceIds(spaceIds, spaceIds.length > 0);

  return React.useMemo(() => {
    const people = new Map(known);
    for (const [pageId, spaceId] of spaces.data ?? []) {
      if (people.has(pageId)) continue;
      const profile = profilesBySpaceId.get(spaceId);
      if (profile) people.set(pageId, { ...personFromProfile({ ...profile, id: pageId }), id: pageId });
    }
    return people;
  }, [known, profilesBySpaceId, spaces.data]);
}
