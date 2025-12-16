'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { Space } from '~/core/io/dto/spaces';
import { getSpacesWhereMember } from '~/core/io/v2/queries';

export const useSpacesWhereMember = (address: `0x${string}` | undefined): Space[] => {
  const { data: spaces, isLoading } = useQuery({
    queryKey: ['spaces-where-member', address],
    queryFn: () => Effect.runPromise(getSpacesWhereMember(address!)),
    enabled: !!address,
  });

  return isLoading ? [] : (spaces ?? []);
};
