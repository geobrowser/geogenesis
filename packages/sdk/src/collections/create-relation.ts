import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '../../constants';
import { GraphUrl } from '../graph-scheme';
import { createGeoId } from '../id';
import { SYSTEM_IDS } from '../system-ids';
import type { SetTripleOp } from '../types';

interface CreateCollectionItemArgs {
  fromId: string; // uuid
  toId: string; // uuid
  relationTypeId: string; // uuid
  name?: string;
  position?: string; // fractional index
}

export function createRelationship(args: CreateCollectionItemArgs): SetTripleOp[] {
  const newEntityId = createGeoId();

  const ops: SetTripleOp[] = [
    // Type of Collection Item
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.TYPES,
        entity: newEntityId,
        value: {
          type: 'URL',
          value: GraphUrl.fromEntityId(SYSTEM_IDS.RELATION_TYPE) as `graph://${typeof SYSTEM_IDS.RELATION_TYPE}`,
        },
      },
    },
    // Entity value for the collection itself
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
        entity: newEntityId,
        value: {
          type: 'URL',
          value: GraphUrl.fromEntityId(args.fromId),
        },
      },
    },
    // Entity value for the entity referenced by this collection item
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
        entity: newEntityId,
        value: {
          type: 'URL',
          value: GraphUrl.fromEntityId(args.toId),
        },
      },
    },
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.RELATION_INDEX,
        entity: newEntityId,
        value: {
          type: 'TEXT',
          value: args.position ?? INITIAL_COLLECTION_ITEM_INDEX_VALUE,
        },
      },
    },
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
        entity: newEntityId,
        value: {
          type: 'URL',
          value: GraphUrl.fromEntityId(args.relationTypeId),
        },
      },
    },
  ] as const;

  if (args.name) {
    ops.push({
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.NAME,
        entity: newEntityId,
        value: {
          type: 'TEXT',
          value: args.name,
        },
      },
    });
  }

  return ops;
}
