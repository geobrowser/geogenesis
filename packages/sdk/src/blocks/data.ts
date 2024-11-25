import { createRelationship } from "../collections";
import { createGeoId } from "../id";
import { SYSTEM_IDS } from "../system-ids";

type DataBlockType = "QUERY" | "COLLECTION" | "GEO"

function getSourceTypeId(dataType: DataBlockType) {
  switch(dataType) {
    case 'COLLECTION':
      return SYSTEM_IDS.COLLECTION_DATA_SOURCE
    case 'GEO':
      return SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE
    case 'QUERY':
      return SYSTEM_IDS.QUERY_DATA_SOURCE
  }
}

export function make({ fromId, dataType, position }: { fromId: string, dataType: DataBlockType, position?: string }) {
  const newBlockId = createGeoId()

  const dataBlockType = createRelationship({
    fromId: newBlockId,
    relationTypeId: SYSTEM_IDS.TYPES,
    toId: SYSTEM_IDS.DATA_BLOCK
  })

  const dataBlockQueryType = createRelationship({
    fromId: newBlockId,
    relationTypeId: SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE,
    toId: getSourceTypeId(dataType)
  })

  const textBlockMarkdownText = {
    type: 'SET_TRIPLE',
    triple: {
      attribute: SYSTEM_IDS.NAME,
      entity: newBlockId,
      value: {
        type: 'TEXT',
        value: "New data block"
      }
    }
  } as const

  const dataBlockRelation = createRelationship({
    fromId,
    relationTypeId: SYSTEM_IDS.BLOCKS,
    toId: newBlockId,
    position
  })

  return [textBlockMarkdownText, ...dataBlockType, ...dataBlockQueryType, ...dataBlockRelation]
}
