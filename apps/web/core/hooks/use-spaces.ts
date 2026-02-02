'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { getSpaces } from '../io/queries';

export const useSpaces = () => {
  const { data: spaces } = useQuery({
    queryKey: ['spaces'],
    queryFn: () => Effect.runPromise(getSpaces()),
  });

  return {
    spaces: spaces ?? [],
  };
};
