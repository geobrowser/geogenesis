import { generateKeyBetween } from 'fractional-indexing';
import { SYSTEM_IDS } from '../../system-ids';

interface ReorderRelationArgs {
  relationId: string;
  beforeIndex?: string;
  afterIndex?: string;
}

type ReorderRelationOp = {
  type: 'SET_TRIPLE';
  triple: {
    attribute: typeof SYSTEM_IDS.RELATION_INDEX;
    entity: string;
    value: {
      type: 'TEXT';
      value: string;
    };
  };
};

// @TODO: Do we want jittering?
export function reorderRelation(args: ReorderRelationArgs): ReorderRelationOp {
  const newIndex = generateKeyBetween(args.beforeIndex, args.afterIndex);

  return {
    type: 'SET_TRIPLE',
    triple: {
      attribute: SYSTEM_IDS.RELATION_INDEX,
      entity: args.relationId,
      value: {
        type: 'TEXT',
        value: newIndex,
      },
    }
  };
}
