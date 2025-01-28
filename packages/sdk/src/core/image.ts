import { make as makeId } from '../id.js';
import { Relation } from '../relation.js';
import { SYSTEM_IDS } from '../system-ids.js';
import type { CreateRelationOp, Op, SetTripleOp } from '../types.js';

type MakeImageReturnType = {
  imageId: string;
  ops: [CreateRelationOp, SetTripleOp];
};

/**
 * Creates an entity representing an Image.
 *
 * @returns ops: The SET_TRIPLE ops for an Image entity
 */
export function make(src: string): MakeImageReturnType {
  const entityId = makeId();

  return {
    imageId: entityId,
    ops: [
      Relation.make({
        fromId: entityId,
        toId: SYSTEM_IDS.IMAGE_TYPE,
        relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
      }),
      {
        type: 'SET_TRIPLE',
        triple: {
          entity: entityId,
          attribute: SYSTEM_IDS.IMAGE_URL_ATTRIBUTE,
          value: {
            type: 'URL',
            value: src,
          },
        },
      },
    ],
  };
}
