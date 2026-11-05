import type { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getEntityBacklinks } from '~/core/io/queries';
import { E } from '~/core/sync/orm';
import type { GeoStore } from '~/core/sync/store';
import type { Relation } from '~/core/types';

import { collectSubtree } from './clone-entity-into-space';

export async function loadMoveBacklinks({
  entityId,
  sourceSpaceId,
  store,
  cache,
}: {
  entityId: string;
  sourceSpaceId: string;
  store: GeoStore;
  cache: QueryClient;
}): Promise<Relation[]> {
  const { entityIds: subtreeIds } = collectSubtree(entityId, sourceSpaceId);

  const backlinks = await Promise.all([...subtreeIds].map(id => Effect.runPromise(getEntityBacklinks(id))));

  const linkingIds = [...new Set(backlinks.flat().map(entity => entity.id))].filter(id => !subtreeIds.has(id));
  if (linkingIds.length === 0) return [];

  const { merged } = await E.syncMany({ store, cache, where: { id: { in: linkingIds } }, first: linkingIds.length });

  return merged.flatMap(entity => entity.relations).filter(relation => subtreeIds.has(relation.toEntity.id));
}
