import { jsonSchema, tool } from 'ai';

import type { GeoQueryInput } from '~/core/chat/geo-query-types';

// Schema-only — execution happens in the sub-agent at /api/chat/geo-query,
// which holds the geo-query skill as its system prompt.
export const geoQuery = tool({
  description:
    "Answer a read question about the Geo graph that searchGraph and getEntity can't. Give it the question in plain language — it writes the GraphQL itself. Use it for: exact counts (\"how many X\"), date ranges (\"published this week\"), more than 10 results, filtering by a property value, traversing relations or backlinks, and the contents of a data block or table on a page. Also use it as a second attempt when searchGraph came back empty or partial and the user's question deserves a real answer. Do NOT use it for a plain lookup of something by name — searchGraph is faster and also sees the user's unpublished drafts, which this does not. Returns { answer, rows?, totalCount?, queries }. Members only.",
  inputSchema: jsonSchema<GeoQueryInput>({
    type: 'object',
    properties: {
      question: {
        type: 'string',
        minLength: 1,
        maxLength: 1_000,
        description:
          'The read question, self-contained and specific. Resolve "this space" / "this page" to ids before asking — the sub-agent has no view of where the user is standing.',
      },
    },
    required: ['question'],
    additionalProperties: false,
  }),
});
