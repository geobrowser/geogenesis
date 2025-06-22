'use client';

import { Position } from '@graphprotocol/grc-20';
import produce from 'immer';
import { atom } from 'jotai';

import { queryClient } from '../query-client';
import { store } from '../state/jotai-store';
import { E } from '../sync/orm';
import { store as geoStore } from '../sync/use-sync-engine';
import { OmitStrict } from '../types';
import { Relation, Value } from '../v2.types';
import { db } from './indexeddb';

const opsWithPersistence = () => {
  const baseAtom = atom<Value[]>([]);

  baseAtom.onMount = setValue => {
    (async () => {
      const stored = await db.values.toArray();

      // @TODO: Move this to hydration layer based on change stream
      for (const value of stored) {
        if (value.isDeleted) geoStore.deleteValue(value);
        else geoStore.setValue(value);
      }

      setValue(stored);
    })();
  };

  return baseAtom;
};

const relationsWithPersistence = () => {
  const baseAtom = atom<Relation[]>([]);

  baseAtom.onMount = setValue => {
    (async () => {
      const stored = await db.relations.toArray();

      // @TODO: Move this to hydration layer based on change stream
      for (const relation of stored) {
        if (relation.isDeleted) geoStore.deleteRelation(relation);
        else geoStore.setRelation(relation);
      }

      setValue(stored);
    })();
  };

  return baseAtom;
};

export const localValuesAtom = opsWithPersistence();
export const localRelationsAtom = relationsWithPersistence();

type UpsertRelationArgs = {
  type: 'SET_RELATION';
  relation: Relation;
};

type DeleteRelationArgs = {
  type: 'DELETE_RELATION';
  relation: Relation;
};

export const upsertRelation = (args: OmitStrict<UpsertRelationArgs, 'type'>) => {
  writeRelation({ ...args, type: 'SET_RELATION' });
};

export const removeRelation = (args: OmitStrict<DeleteRelationArgs, 'type'>) => {
  writeRelation({ ...args, type: 'DELETE_RELATION' });
};

const writeRelation = (args: UpsertRelationArgs | DeleteRelationArgs) => {
  if (args.type === 'SET_RELATION') {
    const unchangedRelations = store.get(localRelationsAtom).filter(r => {
      return r.id !== args.relation.id;
    });

    store.set(localRelationsAtom, [...unchangedRelations, args.relation]);

    return;
  }

  const relationId = args.relation.id;
  const nonDeletedRelations = store.get(localRelationsAtom).filter(r => r.id !== relationId);

  store.set(localRelationsAtom, [
    ...nonDeletedRelations,
    // We can set a dummy relation here since we only care about the deleted state
    {
      spaceId: args.relation.spaceId,
      entityId: '',
      id: relationId as string,
      verified: false,
      position: Position.generate(),
      isDeleted: true,
      renderableType: 'RELATION',
      type: {
        id: '',
        name: null,
      },
      fromEntity: {
        id: args.relation.fromEntity.id,
        name: null,
      },
      toEntity: {
        id: '',
        name: null,
        value: '',
      },
    },
  ]);
};

async function removeEntity(entityId: string) {
  const entity = await E.findOne({ store: geoStore, cache: queryClient, id: entityId });

  if (entity) {
    removeMany(entity.values);

    for (const relation of entity.relations) {
      removeRelation({
        relation,
      });
    }
  }
}

export const upsert = (value: Value) => {
  const newValue = produce(value, draft => {
    draft.hasBeenPublished = false;
    draft.isDeleted = false;
    draft.isLocal = true;
    draft.timestamp = new Date().toISOString();
  });
  writeMany([newValue]);
};

const upsertMany = (values: Value[]) => {
  const newValues = produce(values, draft => {
    for (const value of draft) {
      value.hasBeenPublished = false;
      value.isDeleted = false;
      value.isLocal = true;
      value.timestamp = new Date().toISOString();
    }
  });

  writeMany(newValues);
};

export const remove = (value: Value) => {
  const newValue = produce(value, draft => {
    draft.hasBeenPublished = false;
    draft.isDeleted = true;
    draft.isLocal = true;
    draft.timestamp = new Date().toISOString();
  });

  writeMany([newValue]);
};

const removeMany = (deletedValues: Value[]) => {
  const values = produce(deletedValues, draft => {
    for (const value of draft) {
      value.isDeleted = true;
      value.hasBeenPublished = false;
      value.isLocal = true;
      value.timestamp = new Date().toISOString();
    }
  });

  // We don't delete from our local store, but instead just set a tombstone
  // on the row. This is so we can still publish the changes as an op
  writeMany(values);
};

export const restoreRelations = (relations: Relation[]) => {
  store.set(localRelationsAtom, relations);
};

export const restore = (values: Value[]) => {
  store.set(localValuesAtom, values);
};

const writeMany = (values: Value[]) => {
  const valueIdsToWrite = new Set(values.map(t => t.id));

  // Unchanged values aren't included in the existing set of values
  // being upserted
  const unchangedTriples = store.get(localValuesAtom).filter(t => {
    return !valueIdsToWrite.has(t.id);
  });

  store.set(localValuesAtom, [...unchangedTriples, ...values]);
};

export const deleteAll = (spaceId: string) => {
  const triples = store.get(localValuesAtom).filter(t => t.spaceId !== spaceId);
  store.set(localValuesAtom, triples);

  const relations = store.get(localRelationsAtom).filter(r => r.spaceId !== spaceId);
  store.set(localRelationsAtom, relations);
};

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
