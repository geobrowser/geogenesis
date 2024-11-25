import { createRelationship } from './collections';
import { createGeoId } from './id';
import { SYSTEM_IDS } from './system-ids';
import { Op } from './types';

/**
 * Creates an entity representing an Image.
 *
 * @returns ops: The SET_TRIPLE ops for an Image entity
 */
export function createImageEntityOps(src: string): Op[] {
  const entityId = createGeoId();

  return [
    ...createRelationship({
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
          value: src
        }
      }
    }
  ]
}
