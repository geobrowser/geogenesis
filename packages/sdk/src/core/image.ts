import { createGeoId } from '../id';
import { Relation } from '../relation';
import { SYSTEM_IDS } from '../system-ids';
import type { SetTripleOp } from '../types';

type MakeImageReturnType = {
  imageId: string;
  ops: SetTripleOp[];
};

/**
 * Creates an entity representing an Image.
 *
 * @returns ops: The SET_TRIPLE ops for an Image entity
 */
export function make(src: string): MakeImageReturnType {
  const entityId = createGeoId();

  return {
    imageId: entityId,
    ops: [
      ...Relation.make({
        fromId: entityId,
        toId: SYSTEM_IDS.IMAGE,
        relationTypeId: SYSTEM_IDS.TYPES,
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
