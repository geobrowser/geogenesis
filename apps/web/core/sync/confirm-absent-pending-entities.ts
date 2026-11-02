import { Effect } from 'effect';

import { getEntityNames } from '~/core/io/queries';
import type { Entity } from '~/core/types';

import { reactiveRelations, reactiveValues, syncedEntities } from './store';

/** A decoded batch can omit malformed entities. Confirm absence with the existing ID-only projection. */
export async function confirmAbsentPendingEntities(requestedIds: string[], remote: Entity[]): Promise<string[]> {
  const requested = new Set(requestedIds);
  const found = new Set(remote.map(entity => entity.id));
  const deletedIds = new Set([
    ...reactiveValues
      .get()
      .filter(value => value.isLocal && value.isDeleted && value.hasBeenPublished === false)
      .map(value => value.entity.id),
    ...reactiveRelations
      .get()
      .filter(relation => relation.isLocal && relation.isDeleted && relation.hasBeenPublished === false)
      .map(relation => relation.fromEntity.id),
  ]);
  const candidates = [...deletedIds].filter(id => requested.has(id) && !found.has(id) && !syncedEntities.has(id));
  if (candidates.length === 0) return [];

  try {
    // getEntityNames batches IDs and bounds concurrency. It reads raw IDs without EntityDecoder.
    const existing = new Set((await Effect.runPromise(getEntityNames(candidates))).map(entity => entity.id));
    return candidates.filter(id => !existing.has(id));
  } catch {
    // A failed confirmation is still unknown; never hide a restored deletion on a read error.
    return [];
  }
}
