import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { jsonSchema, tool } from 'ai';
import * as Effect from 'effect/Effect';

import { getResults, getSpaces } from '~/core/io/queries';
import { getSpaceRank } from '~/core/utils/space/space-ranking';

import { MAX_RESULT_ENTRIES, limitEntries, normalizeEntityId, truncateText } from './shared';

type ListSpacesInput = {
  query?: string;
  limit?: number;
};

type ListSpacesOutput =
  | {
      spaces: Array<{ id: string; name: string | null; description: string | null }>;
    }
  | { error: 'lookup_failed' };

export const listSpaces = tool({
  description:
    'List spaces in the Geo knowledge graph. When `query` is provided, searches space names via the OpenSearch-backed endpoint — this reliably finds a match even when it is not in the first page of results. When omitted, returns a generic sample of spaces.',
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
  execute: async ({ query, limit }: ListSpacesInput): Promise<ListSpacesOutput> => {
    const effectiveLimit = Math.min(MAX_RESULT_ENTRIES, Math.max(1, limit ?? 5));
    const trimmedQuery = query?.trim();
    try {
      if (trimmedQuery) {
        // Searching for entities of type Space returns the **topic entity** for
        // each space (topic.id !== space.id). Resolve back to the actual space
        // container via the `topicId` filter so callers get a spaceId that can
        // be passed to navigate({ target: 'space' }).
        const searchResults = await Effect.runPromise(
          getResults({
            query: trimmedQuery,
            typeIds: [SystemIds.SPACE_TYPE],
            limit: effectiveLimit,
          })
        );

        const topicIds = [...new Set(searchResults.map(r => normalizeEntityId(r.id)))];
        if (topicIds.length === 0) {
          return { spaces: [] };
        }

        // Fetch more than the limit so curated spaces can surface past
        // dead/personal ones that happen to share a topic name.
        const spaces = await Effect.runPromise(getSpaces({ topicIds, limit: topicIds.length }));
        const spacesByTopicId = new Map(spaces.map(space => [normalizeEntityId(space.topicId ?? ''), space]));

        // OpenSearch ranks by text match, which can put a dead/personal space
        // above the real curated one (e.g. two entities named "Crypto"). Sort
        // by our hard-coded SPACE_RANK first so curated spaces win ties, then
        // fall back to OpenSearch order.
        const ordered = topicIds
          .map((topicId, index) => {
            const space = spacesByTopicId.get(topicId);
            return space ? { space, searchIndex: index } : null;
          })
          .filter((entry): entry is { space: (typeof spaces)[number]; searchIndex: number } => entry !== null)
          .sort((a, b) => {
            const rankDelta = getSpaceRank(normalizeEntityId(a.space.id)) - getSpaceRank(normalizeEntityId(b.space.id));
            if (rankDelta !== 0) return rankDelta;
            return a.searchIndex - b.searchIndex;
          })
          .map(entry => entry.space);

        const payload = limitEntries(ordered, effectiveLimit).map(space => ({
          id: normalizeEntityId(space.id),
          name: space.entity.name,
          description: space.entity.description ? truncateText(space.entity.description) : null,
        }));

        return { spaces: payload };
      }

      const raw = await Effect.runPromise(getSpaces({ limit: effectiveLimit }));
      const spaces = limitEntries(raw, effectiveLimit).map(space => ({
        id: normalizeEntityId(space.id),
        name: space.entity.name,
        description: space.entity.description ? truncateText(space.entity.description) : null,
      }));

      return { spaces };
    } catch (err) {
      console.error('[chat/listSpaces] lookup failed', err);
      return { error: 'lookup_failed' };
    }
  },
});
