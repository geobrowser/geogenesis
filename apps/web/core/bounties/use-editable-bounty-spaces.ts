'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { uuidToHex } from '~/core/id/normalize';
import { getSpaces } from '~/core/io/queries';

import { CURRENT_BOUNTY_SPACE_IDS } from './constants';
import { bountySpaceFallbackLabel } from './fetch-bounties';

export type EditableBountySpace = { id: string; name: string };

/**
 * The participating bounty spaces the signed-in user can post bounties to
 * (spaces where their personal space id is an editor). Drives the "New
 * bounty" action on the global bounties page.
 */
export function useEditableBountySpaces() {
  const { personalSpaceId } = usePersonalSpaceId();

  return useQuery<EditableBountySpace[]>({
    queryKey: ['bounties', 'editable-spaces', personalSpaceId],
    enabled: !!personalSpaceId && CURRENT_BOUNTY_SPACE_IDS.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const spaces = await Effect.runPromise(getSpaces({ spaceIds: [...CURRENT_BOUNTY_SPACE_IDS] }));
      const me = uuidToHex(personalSpaceId!);
      return spaces
        .filter(space => space.editors.some(editor => uuidToHex(editor) === me))
        .map(space => ({
          id: space.id,
          name: space.entity?.name?.trim() || bountySpaceFallbackLabel(space.id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
