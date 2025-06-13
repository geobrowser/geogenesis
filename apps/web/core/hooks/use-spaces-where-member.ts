import { useQuery } from '@tanstack/react-query';

import { SpaceWhereMember, fetchSpacesWhereMember } from '~/core/io/subgraph/fetch-spaces-where-member';

export const useSpacesWhereMember = (address: `0x${string}` | undefined): SpaceWhereMember[] => {
  const { data: spaces, isLoading } = useQuery({
    queryKey: ['spaces-where-member', address],
    queryFn: () => fetchSpacesWhereMember(address),
  });

  // @TODO(migration): fix with correct types
  return isLoading ? [] : (spaces ?? []);
};
