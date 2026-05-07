import { jsonSchema, tool } from 'ai';

import { ENTITY_ID_PATTERN } from './shared';

type DeletePropertyInput = {
  propertyId: string;
  spaceId: string;
};

export const deleteProperty = tool({
  description: `Delete a property from a space. Symmetric with \`createProperty\`. Tombstones the property entity's values and outgoing relations (including its Data Type relation), and tombstones every backlink — note that this includes any value or relation in this space that USES the property, so existing data on entities that referenced it disappears.

Use when the user explicitly says "delete the X property". Does NOT detect whether the property is in active use; if you suspect it is, search for entities using it first and warn the user before deleting. Refuses if the target isn't actually a property entity.`,
  inputSchema: jsonSchema<DeletePropertyInput>({
    type: 'object',
    properties: {
      propertyId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
    },
    required: ['propertyId', 'spaceId'],
    additionalProperties: false,
  }),
});
