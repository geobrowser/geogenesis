'use client';

import { useQuery } from '@tanstack/react-query';

import { Services } from '~/core/services';

export function useSpaces() {
  const { config, subgraph } = Services.useServices();

  const { data, isLoading } = useQuery({
    queryKey: ['spaces-store'],
    queryFn: async () => subgraph.fetchSpaces({ endpoint: config.subgraph }),
  });

  const spaces = !data || isLoading ? [] : data;
  const admins = Object.fromEntries(spaces.map(space => [space.id, space.admins]));
  const editorControllers = Object.fromEntries(spaces.map(space => [space.id, space.editorControllers]));
  const editors = Object.fromEntries(spaces.map(space => [space.id, space.editors]));

  return {
    spaces,
    admins,
    editorControllers,
    editors,
  };
}
