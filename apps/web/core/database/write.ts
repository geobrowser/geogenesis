import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '@geogenesis/sdk/constants';
import { atom } from 'jotai';

import { getAppTripleId } from '../id/create-id';
import { Relation } from '../io/dto/entities';
import { EntityId } from '../io/schema';
import { store } from '../state/jotai-store';
import { DeleteTripleAppOp, OmitStrict, SetTripleAppOp } from '../types';
import { Relations } from '../utils/relations';
import { Triples } from '../utils/triples';
import { mergeEntityAsync } from './entities';
import { StoredRelation, StoredTriple } from './types';

type WriteStoreOp = OmitStrict<SetTripleAppOp, 'id'>;
type DeleteStoreOp = OmitStrict<DeleteTripleAppOp, 'id' | 'attributeName' | 'entityName' | 'value'>;

export type StoreOp = WriteStoreOp | DeleteStoreOp;
export type StoreRelation = OmitStrict<Relation, 'id'>;

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
      fromId: args.relation.fromEntity.id,
      toId: args.relation.toEntity.id,
      typeOfId: args.relation.typeOf.id,
      spaceId: args.spaceId,
      toIdName: args.relation.toEntity.name,
      typeOfName: args.relation.typeOf.name,
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

    writeMany(triples.map(t => ({ op: { ...t, type: 'SET_TRIPLE' }, spaceId: args.spaceId })));
    return;
  }

  const nonDeletedRelations = store.get(localRelationsAtom).filter(r => r.id !== args.relationId);

  store.set(localRelationsAtom, [
    ...nonDeletedRelations,
    // We can set a dummy relation here since we only care about the deleted state
    {
      id: args.relationId,
      index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
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
  const { triples } = await mergeEntityAsync(EntityId(relationId));
  removeMany(triples, spaceId);
}

export const upsert = (op: OmitStrict<WriteStoreOp, 'type'>, spaceId: string) => {
  writeMany([
    {
      op: {
        ...op,
        type: 'SET_TRIPLE',
      },
      spaceId,
    },
  ]);
};

export const upsertMany = (ops: OmitStrict<WriteStoreOp, 'type'>[], spaceId: string) => {
  writeMany(ops.map(op => ({ op: { ...op, type: 'SET_TRIPLE' }, spaceId })));
};

export const remove = (op: OmitStrict<DeleteStoreOp, 'type'>, spaceId: string) => {
  // We don't delete from our local store, but instead just set a tombstone
  // on the row. This is so we can still publish the changes as an op
  writeMany([
    {
      op: {
        ...op,
        type: 'DELETE_TRIPLE',
      },
      spaceId,
    },
  ]);
};

export const removeMany = (ops: OmitStrict<DeleteStoreOp, 'type'>[], spaceId: string) => {
  // We don't delete from our local store, but instead just set a tombstone
  // on the row. This is so we can still publish the changes as an op
  writeMany(ops.map(op => ({ op: { ...op, type: 'DELETE_TRIPLE' }, spaceId })));
};

export const restore = (ops: { op: StoreOp; spaceId: string }[]) => {
  const triplesToWrite: StoredTriple[] = [];

  for (const { op, spaceId } of ops) {
    const triple: StoredTriple = {
      id: getAppTripleId(op, spaceId),
      entityId: op.entityId,
      attributeId: op.attributeId,
      // How do we make this work well with local image triples? We want
      // to store just the image itself to make rendering images easy,
      // but that's not actually how we publish the images. Maybe we
      // need to update it on Triple.prepareForPublishing...?
      value:
        op.type === 'SET_TRIPLE'
          ? op.value
          : // We don't set value as null so just use placeholder value
            {
              type: 'TEXT',
              value: '',
            },

      entityName: op.type === 'SET_TRIPLE' ? op.entityName : null,
      attributeName: op.type === 'SET_TRIPLE' ? op.attributeName : null,
      space: spaceId,
      hasBeenPublished: false,
      isDeleted: false,
      timestamp: Triples.timestamp(),
    };

    if (op.type === 'DELETE_TRIPLE') {
      triple.isDeleted = true;
    }

    triplesToWrite.push(triple);
  }

  store.set(localOpsAtom, triplesToWrite);
};

const writeMany = (ops: { op: StoreOp; spaceId: string }[]) => {
  const triplesToWrite: StoredTriple[] = [];

  for (const { op, spaceId } of ops) {
    const triple: StoredTriple = {
      id: getAppTripleId(op, spaceId),
      entityId: op.entityId,
      attributeId: op.attributeId,
      // How do we make this work well with local image triples? We want
      // to store just the image itself to make rendering images easy,
      // but that's not actually how we publish the images. Maybe we
      // need to update it on Triple.prepareForPublishing...?
      value:
        op.type === 'SET_TRIPLE'
          ? op.value
          : // We don't set value as null so just use placeholder value
            {
              type: 'TEXT',
              value: '',
            },

      entityName: op.type === 'SET_TRIPLE' ? op.entityName : null,
      attributeName: op.type === 'SET_TRIPLE' ? op.attributeName : null,
      space: spaceId,
      hasBeenPublished: false,
      isDeleted: false,
      timestamp: Triples.timestamp(),
    };

    if (op.type === 'DELETE_TRIPLE') {
      triple.isDeleted = true;
    }

    triplesToWrite.push(triple);
  }

  // Can safely cast to string since we set the id above
  const tripleIdsToWrite = new Set(triplesToWrite.map(t => t.id as string));

  // Unchanged triples aren't included in the existing set of triples
  // being upserted
  const unchangedTriples = store.get(localOpsAtom).filter(t => {
    return !tripleIdsToWrite.has(t.id);
  });

  store.set(localOpsAtom, [...unchangedTriples, ...triplesToWrite]);
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
  };
}

export const DB = {
  upsert,
  upsertMany,
  remove,
  removeMany,
  upsertRelation,
  removeRelation,
};
