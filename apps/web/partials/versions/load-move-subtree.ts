import type { QueryClient } from '@tanstack/react-query';

import { E } from '~/core/sync/orm';
import type { GeoStore } from '~/core/sync/store';
import type { Entity } from '~/core/types';

import { collectSubtree } from './clone-entity-into-space';

/**
 * Loads the entity and every block and tab under it, one level per request. The store only holds
 * what someone has opened, so callers pass the result on instead of reading the store.
 */
export async function loadMoveSubtree({
  entityId,
  sourceSpaceId,
  store,
  cache,
}: {
  entityId: string;
  sourceSpaceId: string;
  store: GeoStore;
  cache: QueryClient;
}): Promise<Entity[]> {
  const loaded: Entity[] = [];
  const requested = new Set<string>();

  while (true) {
    const { entityIds } = collectSubtree(entityId, sourceSpaceId, loaded);
    const next = [...entityIds].filter(id => !requested.has(id));
    if (next.length === 0) return loaded;

    next.forEach(id => requested.add(id));
    const { merged } = await E.syncMany({ store, cache, where: { id: { in: next } }, first: next.length });
    loaded.push(...merged);
  }
}
