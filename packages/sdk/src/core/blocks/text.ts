import { createGeoId } from '../../id.js';
import { Relation } from '../../relation.js';
import { SYSTEM_IDS } from '../../system-ids.js';
import type { Op } from '../../types.js';

type TextBlockArgs = { fromId: string; text: string; position?: string };

export function make({ fromId, text, position }: TextBlockArgs): Op[] {
  const newBlockId = createGeoId();

  const textBlockType = Relation.make({
    fromId: newBlockId,
    relationTypeId: SYSTEM_IDS.TYPES,
    toId: SYSTEM_IDS.TEXT_BLOCK,
  });

  const textBlockMarkdownText = {
    type: 'SET_TRIPLE',
    triple: {
      attribute: SYSTEM_IDS.MARKDOWN_CONTENT,
      entity: newBlockId,
      value: {
        type: 'TEXT',
        value: text,
      },
    },
  } as const;

  const textBlockRelation = Relation.make({
    fromId,
    relationTypeId: SYSTEM_IDS.BLOCKS,
    toId: newBlockId,
    position,
  });

  return [...textBlockType, textBlockMarkdownText, ...textBlockRelation];
}
