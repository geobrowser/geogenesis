'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { uuidToHex } from '~/core/id/normalize';
import { getBatchEntities } from '~/core/io/queries';

/** Names (and avatars, when present) for a set of entity ids — used to label curators in interest/allocation lists. */
export function useEntityNames(entityIds: readonly string[]) {
  const key = [...new Set(entityIds.map(uuidToHex))].sort();
  return useQuery({
    queryKey: ['entity-names', key.join(',')],
    enabled: key.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const entities = await Effect.runPromise(getBatchEntities(key));
      const names = new Map<string, string | null>();
      for (const entity of entities) names.set(uuidToHex(entity.id), entity.name);
      return names;
    },
  });
}
