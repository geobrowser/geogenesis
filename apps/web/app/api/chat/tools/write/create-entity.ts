import { jsonSchema, tool } from 'ai';

import { ENTITY_ID_PATTERN } from './shared';

const MAX_TYPES = 5;

type CreateEntityInput = {
  spaceId: string;
  name: string;
  description?: string;
  typeIds?: string[];
};

export const createEntity = tool({
  description:
    'Create a brand-new entity in a space. Use this when the user asks to "create a new X" / "make a Y entity" and no matching entity exists yet — always `searchGraph` first to avoid duplicating an existing entity. Pass `name` (required), optional `description`, and optional `typeIds` (entity ids of the types to tag it with — look them up via `searchGraph({ query: name, typeId: SystemIds.TYPE })` or `getEntity` on a similar entity\'s `types`). Returns the new entity id so you can immediately address it with other write tools (setEntityValue, setEntityRelation, createBlock). **In your reply, always link the new entity inline by name** as `[Name](geo://entity/{returned id}?space={spaceId you passed})` on its first mention — the user has no way to reach the new entity otherwise.',
  inputSchema: jsonSchema<CreateEntityInput>({
    type: 'object',
    properties: {
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      name: { type: 'string', description: 'Required. Human-readable name for the new entity.' },
      description: { type: 'string' },
      typeIds: {
        type: 'array',
        items: { type: 'string', pattern: ENTITY_ID_PATTERN },
        description: `Up to ${MAX_TYPES} type entity ids. Typical flow: searchGraph for the type name (e.g. "Concept"), take its id.`,
      },
    },
    required: ['spaceId', 'name'],
    additionalProperties: false,
  }),
});
