import { SYSTEM_IDS, createGeoId } from '../../';

interface CreateCollectionReturnType {
  opType: 'SET_TRIPLE';
  triple: {
    attributeId: typeof SYSTEM_IDS.TYPES;
    entityId: string;
    value: {
      type: 'ENTITY';
      value: typeof SYSTEM_IDS.COLLECTION_TYPE;
    };
  };}

export function createCollection(): CreateCollectionReturnType {
  return {
    opType: 'SET_TRIPLE',
    triple: {
      attributeId: SYSTEM_IDS.TYPES,
      entityId: createGeoId(),
      value: {
        type: 'ENTITY',
        value: SYSTEM_IDS.COLLECTION_TYPE
      }
    }
  };
}
