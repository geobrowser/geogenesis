'use client';

import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';
import { atom } from 'jotai';

import { EntityId } from '../io/schema';
import { queryClient } from '../query-client';
import { store } from '../state/jotai-store';
import { E } from '../sync/orm';
import { store as geoStore } from '../sync/use-sync-engine';
import { OmitStrict } from '../types';
import { Relations } from '../utils/relations';
import { Triple } from './Triple';
import { db } from './indexeddb';
import { RemoveOp, StoreRelation, StoredRelation, StoredTriple, UpsertOp } from './types';

const opsWithPersistence = () => {
  const baseAtom = atom<StoredTriple[]>([]);

  baseAtom.onMount = setValue => {
    (async () => {
      const stored = await db.triples.toArray();

      for (const triple of stored) {
        if (triple.isDeleted) geoStore.deleteTriple(triple);
        else geoStore.setTriple(triple);
      }

      setValue(stored);
    })();
  };

  return baseAtom;
};

const relationsWithPersistence = () => {
  const baseAtom = atom<StoredRelation[]>([]);

  baseAtom.onMount = setValue => {
    (async () => {
      const stored = await db.relations.toArray();

      for (const relation of stored) {
        if (relation.isDeleted) geoStore.deleteRelation(relation);
        else geoStore.setRelation(relation);
      }

      setValue(stored);
    })();
  };

  return baseAtom;
};

export const localOpsAtom = opsWithPersistence();
export const localRelationsAtom = relationsWithPersistence();

type UpsertRelationArgs = {
  type: 'SET_RELATION';
  relation: StoreRelation;
  spaceId: string;
};

type DeleteRelationArgs = {
  type: 'DELETE_RELATION';

  relation: StoreRelation;
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

    geoStore.setRelation({
      ...args.relation,
      id: relationId,
    });

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

  const relationId = args.relation.id;

  geoStore.deleteRelation({
    ...args.relation,
    id: EntityId(relationId as string), // we require a relation id to delete
  });

  const nonDeletedRelations = store.get(localRelationsAtom).filter(r => r.id !== relationId);

  store.set(localRelationsAtom, [
    ...nonDeletedRelations,
    // We can set a dummy relation here since we only care about the deleted state
    {
      space: args.spaceId,
      id: EntityId(relationId as string),
      index: INITIAL_RELATION_INDEX_VALUE,
      isDeleted: true,
      typeOf: {
        id: EntityId(''),
        name: null,
      },
      fromEntity: {
        id: EntityId(args.relation.fromEntity.id),
        name: null,
      },
      toEntity: {
        id: EntityId(args.relation.id as string),
        name: null,
        renderableType: 'RELATION',
        value: '',
      },
    },
  ]);
  // @TODO: Delete all triples for this relationship
  // This is async but we aren't awaiting it so we'll see what happens I guess. Might want to
  // use effect or something to monitor this and de-color it.
  deleteRelation(args.relation.id as string, args.spaceId);
};

async function deleteRelation(relationId: string, spaceId: string) {
  // @TODO we might need to delete any relations on a relation, too.
  const entity = await E.findOne({ store: geoStore, cache: queryClient, id: relationId });

  if (entity) {
    removeMany(entity.triples, spaceId);

    // for (const relation of entity.relationsOut) {
    //   removeRelation({
    //     relation,
    //     spaceId,
    //   });
    // }
  }
}

export async function removeEntity(entityId: string, spaceId: string) {
  const entity = await E.findOne({ store: geoStore, cache: queryClient, id: entityId });

  if (entity) {
    removeMany(entity.triples, spaceId);

    for (const relation of entity.relationsOut) {
      removeRelation({
        relation,
        spaceId,
      });
    }
  }
}

export const upsert = (op: UpsertOp, spaceId: string) => {
  const triple = Triple.make({ ...op, space: spaceId }, { hasBeenPublished: false, isDeleted: false });
  writeMany([triple]);
  geoStore.setTriple(triple);
};

export const upsertMany = (ops: UpsertOp[], spaceId: string) => {
  const triples = ops.map((op): StoredTriple => {
    return Triple.make({ ...op, space: spaceId }, { hasBeenPublished: false, isDeleted: false });
  });
  writeMany(triples);

  for (const triple of triples) {
    geoStore.setTriple(triple);
  }
};

export const remove = (op: RemoveOp, spaceId: string) => {
  // We don't delete from our local store, but instead just set a tombstone
  // on the row. This is so we can still publish the changes as an op
  const triple = Triple.make(
    {
      ...op,
      attributeName: op.attributeName ?? null,
      entityName: null,
      space: spaceId,
      value: op.value ?? { type: 'TEXT', value: '' },
    },
    { hasBeenPublished: false, isDeleted: true }
  );

  writeMany([triple]);
  geoStore.deleteTriple(triple);
};

export const removeMany = (ops: RemoveOp[], spaceId: string) => {
  const triples = ops.map(
    (op): StoredTriple =>
      Triple.make(
        {
          ...op,
          attributeName: op.attributeName ?? null,
          entityName: null,
          space: spaceId,
          value: op.value ?? { type: 'TEXT', value: '' },
        },
        { hasBeenPublished: false, isDeleted: true }
      )
  );
  // We don't delete from our local store, but instead just set a tombstone
  // on the row. This is so we can still publish the changes as an op
  writeMany(triples);

  for (const triple of triples) {
    geoStore.deleteTriple(triple);
  }
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

export const deleteAll = (spaceId: string) => {
  const triples = store.get(localOpsAtom).filter(t => t.space !== spaceId);
  store.set(localOpsAtom, triples);

  const relations = store.get(localRelationsAtom).filter(r => r.space !== spaceId);
  store.set(localRelationsAtom, relations);
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
  deleteAll,
};
