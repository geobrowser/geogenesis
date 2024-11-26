import { generateKeyBetween } from 'fractional-indexing';
import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from "../../constants";
import { createGeoId } from "../id";
import { GraphUrl } from "../scheme";
import { SYSTEM_IDS } from "../system-ids";

interface CreateRelationArgs {
  fromId: string; // uuid
  toId: string; // uuid
  relationTypeId: string; // uuid
  position?: string // fractional index
}

type CreateRelationTypeOp = {
  type: 'SET_TRIPLE';
  triple: {
    attribute: typeof SYSTEM_IDS.TYPES;
    entity: string;
    value: {
      type: 'URL';
      value: `graph://${typeof SYSTEM_IDS.RELATION_TYPE}`;
    };
  };
};

type CreateRelationTypeOfOp = {
  type: 'SET_TRIPLE';
  triple: {
    attribute: typeof SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE;
    entity: string;
    value: {
      type: 'URL';
      value: string;
    };
  };
};

type CreateRelationFromOp = {
  type: 'SET_TRIPLE';
  triple: {
    attribute: typeof SYSTEM_IDS.RELATION_FROM_ATTRIBUTE;
    entity: string;
    value: {
      type: 'URL';
      value: string;
    };
  };
};

type CreateRelationToOp = {
  type: 'SET_TRIPLE';
  triple: {
    attribute: typeof SYSTEM_IDS.RELATION_TO_ATTRIBUTE;
    entity: string;
    value: {
      type: 'URL';
      value: string;
    };
  };
};

interface CreateRelationIndexOp {
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

export function make(
  args: CreateRelationArgs
): readonly [
  CreateRelationTypeOp,
  CreateRelationFromOp,
  CreateRelationToOp,
  CreateRelationIndexOp,
  CreateRelationTypeOfOp,
] {
  const newEntityId = createGeoId();

  return [
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.TYPES,
        entity: newEntityId,
        value: {
          type: 'URL',
          value: GraphUrl.fromEntityId(SYSTEM_IDS.RELATION_TYPE) as `graph://${typeof SYSTEM_IDS.RELATION_TYPE}`,
        },
      }
    },
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
        entity: newEntityId,
        value: {
          type: 'URL',
          value: GraphUrl.fromEntityId(args.fromId),
        },
      }
    },
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
        entity: newEntityId,
        value: {
          type: 'URL',
          value: GraphUrl.fromEntityId(args.toId),
        },
      }
    },
    {
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.RELATION_INDEX,
        entity: newEntityId,
        value: {
          type: 'TEXT',
          value: args.position ?? INITIAL_COLLECTION_ITEM_INDEX_VALUE,
        }
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
        }
      },
    },
  ] as const;
}

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
export function reorder(args: ReorderRelationArgs): ReorderRelationOp {
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
