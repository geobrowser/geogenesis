import { jsonSchema, tool } from 'ai';

import { ENTITY_ID_PATTERN } from './shared';

type SetEntityRelationInput = {
  fromEntityId: string;
  spaceId: string;
  typeId: string;
  toEntityId: string;
};

export const setEntityRelation = tool({
  description:
    'Add a typed relation from one entity to another — e.g. link an entity to a related person, tag a page with a topic. `typeId` must be a property whose dataType is RELATION. Both fromEntity and toEntity must exist; use searchGraph or getEntity to resolve ids.',
  inputSchema: jsonSchema<SetEntityRelationInput>({
    type: 'object',
    properties: {
      fromEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      typeId: { type: 'string', pattern: ENTITY_ID_PATTERN, description: 'A RELATION-typed property id.' },
      toEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
    },
    required: ['fromEntityId', 'spaceId', 'typeId', 'toEntityId'],
    additionalProperties: false,
  }),
});

type DeleteEntityRelationInput = {
  fromEntityId: string;
  spaceId: string;
  typeId: string;
  toEntityId: string;
};

export const deleteEntityRelation = tool({
  description:
    'Remove a specific relation edge from one entity to another. Identified by the (fromEntityId, typeId, toEntityId) triple so we do not need the relation id itself.',
  inputSchema: jsonSchema<DeleteEntityRelationInput>({
    type: 'object',
    properties: {
      fromEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      typeId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      toEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
    },
    required: ['fromEntityId', 'spaceId', 'typeId', 'toEntityId'],
    additionalProperties: false,
  }),
});
