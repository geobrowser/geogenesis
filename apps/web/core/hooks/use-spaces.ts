'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { getSpaces } from '../io/v2/queries';

export const useSpaces = () => {
  const { data: spaces } = useQuery({
    queryKey: ['spaces'],
    queryFn: () => Effect.runPromise(getSpaces()),
  });

  return {
    spaces: spaces ?? [],
  };
};
