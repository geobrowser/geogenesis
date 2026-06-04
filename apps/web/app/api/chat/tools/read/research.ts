import { jsonSchema, tool } from 'ai';

import type { ResearchInput } from '~/core/chat/read-types';

// Schema-only — execution happens in the sub-agent at /api/chat/research.
export const research = tool({
  description:
    "Research the open web. Use this when the user asks for facts that aren't in the Geo graph (recent events, public-figure updates, external context for an ingestion turn) — NOT for things you can answer from training. Returns { summary, sources } where summary is a short prose answer and sources is the list of pages cited. Members only. Always call searchGraph first; only use research when Geo doesn't already have the answer. Phrase the query as a focused question or topic — not a full sentence to the user.",
  inputSchema: jsonSchema<ResearchInput>({
    type: 'object',
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        description: 'Focused research query (e.g. "history of The Matrix 1999 production").',
      },
    },
    required: ['query'],
    additionalProperties: false,
  }),
});
