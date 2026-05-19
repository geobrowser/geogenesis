import { jsonSchema, tool } from 'ai';

import type { ListSpacesInput } from '~/core/chat/read-types';

// No-execute: the actual lookup runs client-side in `useReadDispatcher`. The
// merged view picks up locally-created spaces alongside the published list.
export const listSpaces = tool({
  description:
    'List spaces in the Geo knowledge graph. When `query` is provided, searches space names — this reliably finds a match even when it is not in the first page of results. When omitted, returns a generic sample of spaces. Each result returns `id` (the space id, used for navigation and `spaceId` args) and `homeEntityId` (the entity id of the space\'s home/topic entity — use this when targeting the space\'s "front page" as an entity, e.g. as a relation target or for setEntityImage).',
  inputSchema: jsonSchema<ListSpacesInput>({
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Optional — free-text search over space names.',
      },
      limit: { type: 'number', minimum: 1, maximum: 10, description: 'Max spaces to return (1–10, default 5).' },
    },
    additionalProperties: false,
  }),
});
