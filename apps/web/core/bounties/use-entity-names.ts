'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { uuidToHex } from '~/core/id/normalize';
import { getBatchEntities } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';

/**
 * Display names for a set of curator identity ids. Ids may be personal space
 * ids (the system-entity shape allocations and interest use) or legacy person
 * entity ids, so profiles-by-space-id are tried first and entity names fill
 * the gaps — a space system entity's own name is just "Space <uuid>".
 */
export function useEntityNames(entityIds: readonly string[]) {
  const key = [...new Set(entityIds.map(uuidToHex))].sort();
  return useQuery({
    queryKey: ['entity-names', key.join(',')],
    enabled: key.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const names = new Map<string, string | null>();
      const [entities, profiles] = await Promise.all([
        Effect.runPromise(getBatchEntities(key)),
        Effect.runPromise(fetchProfilesBySpaceIds(key)).catch(() => []),
      ]);
      for (const entity of entities) names.set(uuidToHex(entity.id), entity.name);
      profiles.forEach((profile, index) => {
        const name = profile?.name?.trim();
        if (name) names.set(key[index], name);
      });
      return names;
    },
  });
}
