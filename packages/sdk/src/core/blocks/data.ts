import { Relation } from "../../relation";
import { createGeoId } from "../../id";
import { SYSTEM_IDS } from "../../system-ids";
import type { Op } from "../../types";

type DataBlockSourceType = "QUERY" | "COLLECTION" | "GEO"

function getSourceTypeId(sourceType: DataBlockSourceType) {
  switch(sourceType) {
    case 'COLLECTION':
      return SYSTEM_IDS.COLLECTION_DATA_SOURCE
    case 'GEO':
      return SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE
    case 'QUERY':
      return SYSTEM_IDS.QUERY_DATA_SOURCE
  }
}

type DataBlockArgs = { fromId: string, sourceType: DataBlockSourceType, position?: string }

export function make({ fromId, sourceType, position }: DataBlockArgs): Op[] {
  const newBlockId = createGeoId()

  const dataBlockType = Relation.make({
    fromId: newBlockId,
    relationTypeId: SYSTEM_IDS.TYPES,
    toId: SYSTEM_IDS.DATA_BLOCK
  })

  const dataBlockSourceType = Relation.make({
    fromId: newBlockId,
    relationTypeId: SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE,
    toId: getSourceTypeId(sourceType)
  })

  const dataBlockRelation = Relation.make({
    fromId,
    relationTypeId: SYSTEM_IDS.BLOCKS,
    toId: newBlockId,
    position
  })

  return [...dataBlockType, ...dataBlockSourceType, ...dataBlockRelation]
}
