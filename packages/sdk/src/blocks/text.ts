import { createRelationship } from "../collections";
import { createGeoId } from "../id";
import { SYSTEM_IDS } from "../system-ids";

export function make({ fromId, text, position }: { fromId: string, text: string, position?: string }) {
  const newBlockId = createGeoId()

  const textBlockType = createRelationship({
    fromId: newBlockId,
    relationTypeId: SYSTEM_IDS.TYPES,
    toId: SYSTEM_IDS.TEXT_BLOCK
  })

  const textBlockMarkdownText = {
    type: 'SET_TRIPLE',
    triple: {
      attribute: SYSTEM_IDS.MARKDOWN_CONTENT,
      entity: newBlockId,
      value: {
        type: 'TEXT',
        value: text
      }
    }
  } as const

  const textBlockRelation = createRelationship({
    fromId,
    relationTypeId: SYSTEM_IDS.BLOCKS,
    toId: newBlockId,
    position
  })

  return [...textBlockType, textBlockMarkdownText, ...textBlockRelation]
}
