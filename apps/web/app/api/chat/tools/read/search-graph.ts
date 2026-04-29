import { jsonSchema, tool } from 'ai';
import * as Effect from 'effect/Effect';

import { getResults } from '~/core/io/queries';

import { MAX_RESULT_ENTRIES, isEntityId, limitEntries, normalizeEntityId } from './shared';

type SearchGraphInput = {
  query: string;
  spaceId?: string;
  typeId?: string;
  limit?: number;
};

type SearchGraphResult = {
  id: string;
  name: string | null;
  spaceId: string;
  spaceName: string | null;
  typeNames: string[];
};

type SearchGraphOutput = { results: SearchGraphResult[] } | { error: 'lookup_failed' };

export const searchGraph = tool({
  description:
    'Search the Geo knowledge graph by free-text query. Use this before answering any question that mentions a specific entity, person, company, movie, topic, or other named thing in the graph. Returns up to 10 matches. Each match includes an id you can pass to getEntity for more detail.',
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
  execute: async ({ query, spaceId, typeId, limit }: SearchGraphInput): Promise<SearchGraphOutput> => {
    const effectiveLimit = Math.min(MAX_RESULT_ENTRIES, Math.max(1, limit ?? 5));
    const scopedSpaceId = spaceId && isEntityId(spaceId) ? normalizeEntityId(spaceId) : undefined;
    const scopedTypeId = typeId && isEntityId(typeId) ? normalizeEntityId(typeId) : undefined;
    try {
      const raw = await Effect.runPromise(
        getResults({
          query,
          spaceId: scopedSpaceId,
          typeIds: scopedTypeId ? [scopedTypeId] : undefined,
          limit: effectiveLimit,
        })
      );

      // Entities with no space produce malformed geo:// hrefs and broken navigate calls.
      const results = limitEntries(raw, effectiveLimit).flatMap(entity => {
        const firstSpace = entity.spaces[0];
        if (!firstSpace) return [];
        return [
          {
            id: normalizeEntityId(entity.id),
            name: entity.name,
            spaceId: normalizeEntityId(firstSpace.spaceId),
            spaceName: firstSpace.name ?? null,
            typeNames: entity.types.map(t => t.name).filter((n): n is string => typeof n === 'string' && n.length > 0),
          },
        ];
      });

      return { results };
    } catch (err) {
      console.error('[chat/searchGraph] lookup failed', err);
      return { error: 'lookup_failed' };
    }
  },
});
