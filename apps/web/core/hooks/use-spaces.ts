'use client';

import { useQuery } from '@tanstack/react-query';

import { Services } from '../services';

export const useSpaces = () => {
  const { subgraph } = Services.useServices();

  const { data: spaces } = useQuery({
    queryKey: ['spaces'],
    queryFn: () => subgraph.fetchSpaces(),
  });

  return {
    spaces: spaces ?? [],
  };
};
