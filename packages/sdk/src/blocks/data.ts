import { createRelationship } from '../collections';
import { createGeoId } from '../id';
import { SYSTEM_IDS } from '../system-ids';

type DataBlockSourceType = 'QUERY' | 'COLLECTION' | 'GEO';

function getSourceTypeId(sourceType: DataBlockSourceType) {
  switch (sourceType) {
    case 'COLLECTION':
      return SYSTEM_IDS.COLLECTION_DATA_SOURCE;
    case 'GEO':
      return SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE;
    case 'QUERY':
      return SYSTEM_IDS.QUERY_DATA_SOURCE;
  }
}

export function make({
  fromId,
  sourceType,
  position,
  name,
}: {
  fromId: string;
  sourceType: DataBlockSourceType;
  position?: string;
  name?: string;
}) {
  const newBlockId = createGeoId();

  const dataBlockType = createRelationship({
    fromId: newBlockId,
    relationTypeId: SYSTEM_IDS.TYPES,
    toId: SYSTEM_IDS.DATA_BLOCK,
  });

  const dataBlockSourceType = createRelationship({
    fromId: newBlockId,
    relationTypeId: SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE,
    toId: getSourceTypeId(sourceType),
  });

  const dataBlockRelation = createRelationship({
    fromId,
    relationTypeId: SYSTEM_IDS.BLOCKS,
    toId: newBlockId,
    position,
  });

  const ops = [...dataBlockType, ...dataBlockSourceType, ...dataBlockRelation];

  if (name) {
    ops.push({
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.NAME,
        entity: newBlockId,
        value: {
          type: 'TEXT',
          value: name,
        },
      },
    });
  }

  return ops;
}
