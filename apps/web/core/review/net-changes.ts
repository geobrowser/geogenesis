import { type EntityBaseline, hasCompleteEntityList } from '~/core/io/entity-coverage';
import type { Relation, Value } from '~/core/types';

type SyncedEntities = ReadonlyMap<string, EntityBaseline | null>;

/**
 * Filter values to only include net changes compared to the remote/synced state.
 * Excludes values created-then-deleted locally and values unchanged from remote.
 * Only compares against non-local values in syncedEntities because the SyncEngine
 * can bake local edits into syncedEntities during re-sync.
 */
export function getNetValues(localValues: Value[], syncedEntities: SyncedEntities): Value[] {
  return localValues.filter(v => {
    const remoteEntity = syncedEntities.get(v.entity.id);

    if (v.isDeleted) {
      // Persisted deletions can be restored before their remote entity is hydrated.
      // Only discard a deletion when a known baseline proves it was created locally.
      if (!remoteEntity) return !syncedEntities.has(v.entity.id);
      return (
        !hasCompleteEntityList(remoteEntity, 'values', v.spaceId) ||
        remoteEntity.values.some(remote => remote.id === v.id && !remote.isLocal)
      );
    }

    // If the value is unchanged from the remote version, skip it
    if (remoteEntity) {
      const remoteValue = remoteEntity.values.find(
        remote =>
          !remote.isLocal &&
          (remote.id === v.id || (remote.property.id === v.property.id && remote.spaceId === v.spaceId))
      );
      if (remoteValue && remoteValue.value === v.value) return false;
    }

    return true;
  });
}

/**
 * Filter relations to only include net changes compared to the remote/synced state.
 * Excludes relations created-then-deleted locally, relations identical to remote,
 * and delete+create pairs that restore the original state (cycling back).
 * Only compares against non-local relations in syncedEntities because the SyncEngine
 * can bake local edits into syncedEntities during re-sync.
 */
export function getNetRelations(localRelations: Relation[], syncedEntities: SyncedEntities): Relation[] {
  // Semantic identity of a relation. toSpaceId is included so that changing only
  // the "to space" of a relation counts as a change in the flowbar.
  const relKey = (rel: Relation) =>
    `${rel.fromEntity.id}:${rel.type.id}:${rel.toEntity.id}:${rel.spaceId}:${rel.toSpaceId ?? ''}`;

  // Build a set of semantic keys for active local relations
  const activeKeys = new Set(localRelations.filter(r => !r.isDeleted).map(relKey));

  return localRelations.filter(r => {
    const remoteEntity = syncedEntities.get(r.fromEntity.id);

    if (r.isDeleted) {
      // An absent cache entry is unknown, not proof that the relation never existed.
      if (!remoteEntity) return !syncedEntities.has(r.fromEntity.id);
      const remoteRelation = remoteEntity.relations.find(remote => remote.id === r.id && !remote.isLocal);
      if (!remoteRelation) {
        return !hasCompleteEntityList(remoteEntity, 'relations', r.spaceId);
      }

      // If an active local relation restores the same (fromEntity, type, toEntity, space, toSpace)
      // as the deleted remote relation, both cancel out — net-zero
      if (activeKeys.has(relKey(remoteRelation))) return false;

      return true;
    }

    // Active relation — skip if semantically identical to a remote relation.
    // Position is part of identity here: a pure reorder keeps the same
    // (from, type, to, space, toSpace) but must still count as a change.
    if (remoteEntity) {
      const key = relKey(r);
      const matchesRemote = remoteEntity.relations.some(
        remote => !remote.isLocal && relKey(remote) === key && (remote.position ?? null) === (r.position ?? null)
      );
      if (matchesRemote) return false;
    }

    return true;
  });
}
