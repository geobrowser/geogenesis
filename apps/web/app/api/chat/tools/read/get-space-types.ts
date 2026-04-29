import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { jsonSchema, tool } from 'ai';
import * as Effect from 'effect/Effect';

import { getAllEntities } from '~/core/io/queries';

import { MAX_RESULT_ENTRIES, isEntityId, limitEntries, normalizeEntityId, truncateText } from './shared';

type GetSpaceTypesInput = {
  spaceId: string;
  limit?: number;
};

type GetSpaceTypesResult = {
  id: string;
  name: string | null;
  description: string | null;
};

type GetSpaceTypesOutput = { types: GetSpaceTypesResult[] } | { error: 'invalid_input' } | { error: 'lookup_failed' };

export const getSpaceTypes = tool({
  description:
    'List the entity Types defined in a space — the space\'s ontology. Call this whenever the user names a kind of thing tied to a space ("news stories in Crypto", "movies in my space", "products in this space") so you can match their colloquial phrasing to the actual type name and id used in that space (e.g. `News Story` not `Article`). Returns `{ id, name, description }` per type. Use the returned id directly as `typeId` for `searchGraph`, `setDataBlockFilters`, `createEntity`, etc. — do not re-search for it.',
  inputSchema: jsonSchema<GetSpaceTypesInput>({
    type: 'object',
    properties: {
      spaceId: {
        type: 'string',
        description: 'Space id (dashless hex or uuid) whose types to list.',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        description: 'Max types to return (1–50, default 25).',
      },
    },
    required: ['spaceId'],
    additionalProperties: false,
  }),
  execute: async ({ spaceId, limit }: GetSpaceTypesInput): Promise<GetSpaceTypesOutput> => {
    if (!isEntityId(spaceId)) return { error: 'invalid_input' };
    const effectiveLimit = Math.min(50, Math.max(1, limit ?? 25));
    const scopedSpaceId = normalizeEntityId(spaceId);
    try {
      const raw = await Effect.runPromise(
        getAllEntities({
          spaceId: scopedSpaceId,
          typeId: SystemIds.SCHEMA_TYPE,
          limit: effectiveLimit,
        })
      );

      const types = limitEntries(raw, effectiveLimit).map(entity => ({
        id: normalizeEntityId(entity.id),
        name: entity.name,
        description: entity.description ? truncateText(entity.description) : null,
      }));

      return { types };
    } catch (err) {
      console.error('[chat/getSpaceTypes] lookup failed', err);
      return { error: 'lookup_failed' };
    }
  },
});
