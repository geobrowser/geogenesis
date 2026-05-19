import { jsonSchema, tool } from 'ai';

import type { SearchImagesInput } from '~/core/chat/read-types';

// Schema-only — the actual search runs in a sub-agent (POST
// /api/chat/search-images) called by the client-side dispatcher. Mirrors the
// `research` split so the orchestrator never sees Anthropic's encrypted_content
// blobs from the hosted webSearch tool.
export const searchImages = tool({
  description:
    "Find direct image URLs on the open web — for cover images, avatars, posters, logos, and other media you can attach to a Geo entity. Use this BEFORE setEntityImage when the user asks for an image but hasn't supplied a URL. Returns { images: [{ url, title, sourceUrl }] } where `url` is a direct .jpg/.png/.webp etc. URL ready to pass to setEntityImage. Empty `images` means no direct URL was found — surface that plainly rather than calling setEntityImage with a guessed URL. Members only. Phrase the query as a focused image-search topic (e.g. 'Shawshank Redemption movie poster').",
  inputSchema: jsonSchema<SearchImagesInput>({
    type: 'object',
    properties: {
      query: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        description: "Focused image-search query (e.g. 'Shawshank Redemption movie poster').",
      },
    },
    required: ['query'],
    additionalProperties: false,
  }),
});
