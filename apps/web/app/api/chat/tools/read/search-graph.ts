import { jsonSchema, tool } from 'ai';

import type { SearchGraphInput } from '~/core/chat/read-types';

// No-execute: the actual search runs client-side in `useReadDispatcher` so
// locally-created entities and locally-edited names show up alongside remote
// results.
export const searchGraph = tool({
  description:
    "Search the Geo knowledge graph by free-text query. Use this before answering any question that mentions a specific entity, person, company, movie, topic, or other named thing in the graph. Returns up to 10 matches. Each match includes an id you can pass to getEntity for more detail. Local matches (the user's unpublished entities) are returned first; `isDraft: true` flags a local-only result.",
  inputSchema: jsonSchema<SearchGraphInput>({
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1, description: 'Free-text search term.' },
      spaceId: {
        type: 'string',
        description: 'Optional — scope the search to a single space id (dashless hex or uuid).',
      },
      typeId: {
        type: 'string',
        description: 'Optional — scope the search to entities of a given type id.',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 10,
        description: 'Max results to return (1–10, default 5).',
      },
    },
    required: ['query'],
    additionalProperties: false,
  }),
});
