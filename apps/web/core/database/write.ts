import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';
import { atom } from 'jotai';

import { EntityId } from '../io/schema';
import { store } from '../state/jotai-store';
import { OmitStrict } from '../types';
import { Relations } from '../utils/relations';
import { Triple } from './Triple';
import { mergeEntityAsync } from './entities';
import { RemoveOp, StoreRelation, StoredRelation, StoredTriple, UpsertOp } from './types';

export const localOpsAtom = atom<StoredTriple[]>([]);
export const localRelationsAtom = atom<StoredRelation[]>([]);

type UpsertRelationArgs = {
  type: 'SET_RELATION';
  relation: StoreRelation;
  spaceId: string;
};

type DeleteRelationArgs = {
  type: 'DELETE_RELATION';
  relationId: EntityId;
  spaceId: string;
};

export const upsertRelation = (args: OmitStrict<UpsertRelationArgs, 'type'>) => {
  writeRelation({ ...args, type: 'SET_RELATION' });
};

export const removeRelation = (args: OmitStrict<DeleteRelationArgs, 'type'>) => {
  writeRelation({ ...args, type: 'DELETE_RELATION' });
};

const writeRelation = (args: UpsertRelationArgs | DeleteRelationArgs) => {
  if (args.type === 'SET_RELATION') {
    // Unchanged triples aren't included in the existing set of triples
    // being upserted
    // @TODO: Which ops do we write here?
    const triples = Relations.createRelationshipTriples({
      relationId: args.relation.id,
      fromId: args.relation.fromEntity.id,
      toId: args.relation.toEntity.id,
      typeOfId: args.relation.typeOf.id,
      spaceId: args.spaceId,
    });

    const relationId = EntityId(triples[0].entityId);

    const unchangedRelations = store.get(localRelationsAtom).filter(r => {
      return r.id !== relationId;
    });

    store.set(localRelationsAtom, [
      ...unchangedRelations,
      {
        ...args.relation,
        id: relationId,
      },
    ]);

    writeMany(triples.map(t => Triple.make(t)));
    return;
  }

  const nonDeletedRelations = store.get(localRelationsAtom).filter(r => r.id !== args.relationId);

  store.set(localRelationsAtom, [
    ...nonDeletedRelations,
    // We can set a dummy relation here since we only care about the deleted state
    {
      space: args.spaceId,
      id: args.relationId,
      index: INITIAL_RELATION_INDEX_VALUE,
      isDeleted: true,
      typeOf: {
        id: EntityId(''),
        name: null,
      },
      fromEntity: {
        id: EntityId(args.relationId),
        name: null,
      },
      toEntity: {
        id: EntityId(args.relationId),
        name: null,
        renderableType: 'RELATION',
        value: '',
      },
    },
  ]);
  // @TODO: Delete all triples for this relationship
  // This is async but we aren't awaiting it so we'll see what happens I guess. Might want to
  // use effect or something to monitor this and de-color it.
  deleteRelation(args.relationId, args.spaceId);
};

async function deleteRelation(relationId: string, spaceId: string) {
  // @TODO we might need to delete any relations on a relation, too.
  const { triples } = await mergeEntityAsync(EntityId(relationId));
  removeMany(triples, spaceId);
}

export async function removeEntity(entityId: string, spaceId: string) {
  const { triples, relationsOut } = await mergeEntityAsync(EntityId(entityId));
  removeMany(triples, spaceId);

  for (const relation of relationsOut) {
    removeRelation({
      relationId: relation.id,
      spaceId,
    });
  }
}

export const upsert = (op: UpsertOp, spaceId: string) => {
  const triple = Triple.make({ ...op, space: spaceId }, { hasBeenPublished: false, isDeleted: false });
  writeMany([triple]);
};

export const upsertMany = (ops: UpsertOp[], spaceId: string) => {
  const triples = ops.map((op): StoredTriple => {
    return Triple.make({ ...op, space: spaceId }, { hasBeenPublished: false, isDeleted: false });
  });
  writeMany(triples);
};

export const remove = (op: RemoveOp, spaceId: string) => {
  // We don't delete from our local store, but instead just set a tombstone
  // on the row. This is so we can still publish the changes as an op
  writeMany([
    Triple.make(
      { ...op, attributeName: null, entityName: null, space: spaceId, value: { type: 'TEXT', value: '' } },
      { hasBeenPublished: false, isDeleted: true }
    ),
  ]);
};

export const removeMany = (ops: RemoveOp[], spaceId: string) => {
  const triples = ops.map(
    (op): StoredTriple =>
      Triple.make(
        { ...op, attributeName: null, entityName: null, space: spaceId, value: { type: 'TEXT', value: '' } },
        { hasBeenPublished: false, isDeleted: true }
      )
  );
  // We don't delete from our local store, but instead just set a tombstone
  // on the row. This is so we can still publish the changes as an op
  writeMany(triples);
};

export const restoreRelations = (relations: StoredRelation[]) => {
  store.set(localRelationsAtom, relations);
};

export const restore = (ops: StoredTriple[]) => {
  store.set(localOpsAtom, ops);
};

const writeMany = (triples: StoredTriple[]) => {
  // Can safely cast to string since we set the id above
  const tripleIdsToWrite = new Set(triples.map(t => t.id));

  // Unchanged triples aren't included in the existing set of triples
  // being upserted
  const unchangedTriples = store.get(localOpsAtom).filter(t => {
    return !tripleIdsToWrite.has(t.id);
  });

  store.set(localOpsAtom, [...unchangedTriples, ...triples]);
};

/**
 * Hook to write to the ops event stream. The ops event stream is mapped by
 * downstream consumers that transform the stream to other data models like
 * entities.
 *
 * You shouldn't need to read the ops in app-code except at publish-time.
 * Instead, read from a mapped stream using a hook like useEntities.
 */
export function useWriteOps() {
  return {
    upsert,
    upsertMany,
    remove,
    restore,
    restoreRelations,
  };
}

export const DB = {
  upsert,
  upsertMany,
  remove,
  removeMany,
  upsertRelation,
  removeRelation,
  removeEntity,
};
