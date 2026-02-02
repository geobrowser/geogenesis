'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { Space } from '~/core/io/dto/spaces';
import { getSpacesWhereMember } from '~/core/io/queries';

/**
 * Hook to get all spaces where the user is an editor or member.
 *
 * @param memberSpaceId - The user's personal space ID (UUID format, not wallet address).
 *                        Use `usePersonalSpaceId` hook to get this from the user's wallet address.
 */
export const useSpacesWhereMember = (memberSpaceId: string | undefined): Space[] => {
  const { data: spaces, isLoading } = useQuery({
    queryKey: ['spaces-where-member', memberSpaceId],
    queryFn: () => Effect.runPromise(getSpacesWhereMember(memberSpaceId!)),
    enabled: !!memberSpaceId,
  });

  return isLoading ? [] : (spaces ?? []);
};
