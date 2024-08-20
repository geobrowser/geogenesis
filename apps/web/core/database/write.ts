import { atom } from 'jotai';

import { getAppTripleId } from '../id/create-id';
import { store } from '../state/jotai-store';
import { DeleteTripleAppOp, OmitStrict, SetTripleAppOp } from '../types';
import { Triples } from '../utils/triples';
import { StoredTriple } from './types';

export const localOpsAtom = atom<StoredTriple[]>([]);

type WriteStoreOp = OmitStrict<SetTripleAppOp, 'id'>;
type DeleteStoreOp = OmitStrict<DeleteTripleAppOp, 'id' | 'attributeName' | 'entityName' | 'value'>;

// @TODO: Write about why we have FOUR representations for an op (store op, app op, substream op, ipfs op)
export type StoreOp = WriteStoreOp | DeleteStoreOp;

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
