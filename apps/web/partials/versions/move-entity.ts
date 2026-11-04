import type { QueryClient } from '@tanstack/react-query';

import { E } from '~/core/sync/orm';
import type { GeoStore } from '~/core/sync/store';
import { GeoEventStream } from '~/core/sync/stream';
import type { Mutator } from '~/core/sync/use-mutate';
import type { Entity, Relation } from '~/core/types';

import { cloneEntityIntoSpace, collectHydrationTargetIds } from './clone-entity-into-space';
import { loadMoveBacklinks } from './load-move-backlinks';
import { loadMoveSubtree } from './load-move-subtree';
import { collectMoveDeletions } from './move-entity-deletions';
import { retargetMoveBacklinks } from './retarget-move-backlinks';

/**
 * Moves an entity, with its blocks and tabs, from one space to another. Shared by the Move to menu
 * and the chat assistant. Returns false, having written nothing, when something it needs fails to load.
 */
export async function moveEntity({
  entityId,
  sourceSpaceId,
  targetSpaceId,
  storage,
  store,
  cache,
  stream,
}: {
  entityId: string;
  sourceSpaceId: string;
  targetSpaceId: string;
  storage: Mutator;
  store: GeoStore;
  cache: QueryClient;
  stream: GeoEventStream;
}): Promise<boolean> {
  if (!targetSpaceId || targetSpaceId === sourceSpaceId) return false;

  // 0. Load the blocks and tabs under the entity. A tab nobody opened is not in the store, so the
  // move would copy it empty and leave its blocks behind.
  let subtree: Entity[];

  try {
    subtree = await loadMoveSubtree({ entityId, sourceSpaceId, store, cache });
  } catch {
    return false;
  }

  // Load the media the clone copies. A media entity nobody opened is not in the store, so it
  // would be copied as nothing. The clone reads them from `loaded`: the store only takes them in
  // on a later microtask.
  const hydrationIds = collectHydrationTargetIds(entityId, sourceSpaceId, subtree);
  let loaded: Entity[] = [];

  if (hydrationIds.length > 0) {
    try {
      const { merged, remote } = await E.syncMany({
        store,
        cache,
        where: { id: { in: hydrationIds } },
        first: hydrationIds.length,
      });

      loaded = merged;

      if (merged.length > 0) {
        stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: merged, remoteEntities: remote });
      }
    } catch {
      return false;
    }
  }

  // Backlinks from every space, which the store only holds for entities someone opened.
  let backlinks: Relation[];

  try {
    backlinks = await loadMoveBacklinks({ entityId, sourceSpaceId, store, cache, loaded: subtree });
  } catch {
    return false;
  }

  // 1. Clone entity into target space
  cloneEntityIntoSpace(entityId, sourceSpaceId, targetSpaceId, storage, [...subtree, ...loaded]);

  // 2. Delete entity from source space. The clone walked the BLOCKS/TABS
  // subtree, so tear down the same subtree here: the root always goes, and
  // each descendant goes unless something outside the subtree still points at
  // it (a shared block). What that comes to is decided in `collectMoveDeletions`,
  // where it can be tested.
  const { values, relations } = collectMoveDeletions(entityId, sourceSpaceId, backlinks, subtree);

  storage.values.deleteMany(values);
  storage.relations.deleteMany(relations);

  // 3. Point this space's backlinks at where the data went. They survive the move untouched —
  // the entity id has not changed — but one that resolves to the source space now resolves to a
  // space the entity's data just left.
  retargetMoveBacklinks(entityId, sourceSpaceId, targetSpaceId, storage, backlinks);

  return true;
}
