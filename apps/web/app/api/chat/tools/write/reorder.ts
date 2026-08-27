import { jsonSchema, tool } from 'ai';

import { ENTITY_ID_PATTERN } from './shared';

// Flat enum + referenceId at the input layer: AI SDK has quirks with
// discriminated-union JSON schemas.
type MoveBlockInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
  target: 'first' | 'last' | 'before' | 'after';
  referenceBlockId?: string;
};

type MoveRelationInput = {
  fromEntityId: string;
  typeId: string;
  toEntityId: string;
  spaceId: string;
  target: 'first' | 'last' | 'before' | 'after';
  referenceToEntityId?: string;
};

export const moveBlock = tool({
  description:
    'Reorder an existing block on a page. Use when the user asks to "move the X block up / down / to the top / above Y". Pass `target: "first" | "last"` for endpoint moves, or `target: "before" | "after"` plus `referenceBlockId` for adjacent placement. The dispatcher updates the BLOCKS relation\'s position field in place, so data-block views / filters stay attached.',
  inputSchema: jsonSchema<MoveBlockInput>({
    type: 'object',
    properties: {
      blockId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      parentEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      target: { type: 'string', enum: ['first', 'last', 'before', 'after'] },
      referenceBlockId: {
        type: 'string',
        pattern: ENTITY_ID_PATTERN,
        description: 'Required when target is "before" or "after". Ignored for "first" / "last".',
      },
    },
    required: ['blockId', 'parentEntityId', 'spaceId', 'target'],
    additionalProperties: false,
  }),
});

export const moveRelation = tool({
  description:
    "Reorder a relation within a set (e.g. move a Tags entry before another, or push a relation to the top of its group). Pass the triple that identifies the relation — `fromEntityId` + `typeId` + `toEntityId` — and the target position. The dispatcher updates the existing relation's position without minting a new relation, so relation-entity ids (and any properties hanging off them) are preserved.",
  inputSchema: jsonSchema<MoveRelationInput>({
    type: 'object',
    properties: {
      fromEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      typeId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      toEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      target: { type: 'string', enum: ['first', 'last', 'before', 'after'] },
      referenceToEntityId: {
        type: 'string',
        pattern: ENTITY_ID_PATTERN,
        description: 'Required when target is "before" or "after". The toEntity id of the relation to anchor against.',
      },
    },
    required: ['fromEntityId', 'typeId', 'toEntityId', 'spaceId', 'target'],
    additionalProperties: false,
  }),
});
