import { jsonSchema, tool } from 'ai';

import type { WebFetchInput } from '~/core/chat/read-types';

// Schema-only — execution happens in the sub-agent at /api/chat/web-fetch.
export const webFetch = tool({
  description:
    "Fetch the contents of a SPECIFIC URL the user provided (e.g. \"summarize this page: https://...\", \"what does this X post say https://x.com/...\"). Use webFetch — NOT research — whenever the user pastes a URL and wants its content. For x.com / twitter.com URLs the server routes through a Twitter-aware path that can extract post text without JS rendering; for everything else it uses Anthropic's web fetch. Returns { summary, sources } same shape as research. Members only. If the result is { error: 'not_accessible' } or { error: 'invalid_url' }, tell the user plainly that you can't access that URL — do NOT silently fall back to research or fabricate from training data.",
  inputSchema: jsonSchema<WebFetchInput>({
    type: 'object',
    properties: {
      url: {
        type: 'string',
        minLength: 8,
        maxLength: 2_000,
        description: 'Full http(s) URL the user wants fetched. Must come from the user message, not constructed.',
      },
    },
    required: ['url'],
    additionalProperties: false,
  }),
});
