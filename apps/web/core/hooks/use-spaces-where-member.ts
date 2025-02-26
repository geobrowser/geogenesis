import { useQuery } from '@tanstack/react-query';

import { Space } from '~/core/io/dto/spaces';
import { fetchSpacesWhereMember } from '~/core/io/subgraph/fetch-spaces-where-member';

export const useSpacesWhereMember = (address: `0x${string}` | undefined): Space[] => {
  const { data: spaces, isLoading } = useQuery({
    queryKey: ['spaces-where-member', address],
    queryFn: () => fetchSpacesWhereMember(address),
  });

  return isLoading ? [] : (spaces as Space[]);
};
