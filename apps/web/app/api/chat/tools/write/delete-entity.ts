import { jsonSchema, tool } from 'ai';

import { ENTITY_ID_PATTERN } from './shared';

type DeleteEntityInput = {
  entityId: string;
  spaceId: string;
};

export const deleteEntity = tool({
  description: `Delete an entity from a space. Tombstones every value the entity has in this space, every relation it points OUT to, and every backlink (incoming relation from any space). Child blocks owned only by this entity are deleted too — blocks that are also referenced from elsewhere are left alone.

Use when the user says "delete this entity", "remove the X page", or asks to undo an entity that was just created. Pass the entity's id and the space the entity lives in. Does NOT navigate the user away — if the user is currently viewing the deleted entity, suggest they navigate elsewhere.

Does NOT cascade to tabs (which are themselves entities) — call \`deleteEntity\` again per tab if needed. Asymmetric with \`createEntity\`: there's no recovery once tombstoned + published.`,
  inputSchema: jsonSchema<DeleteEntityInput>({
    type: 'object',
    properties: {
      entityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
    },
    required: ['entityId', 'spaceId'],
    additionalProperties: false,
  }),
});
