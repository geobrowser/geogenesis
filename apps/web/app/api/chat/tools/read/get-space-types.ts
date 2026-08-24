import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { jsonSchema, tool } from 'ai';
import * as Effect from 'effect/Effect';

import { getAllEntities } from '~/core/io/queries';

import { MAX_RESULT_ENTRIES, isEntityId, limitEntries, normalizeEntityId, truncateText } from './shared';

type GetSpaceTypesInput = {
  spaceId: string;
  nameContains?: string;
  limit?: number;
};

type GetSpaceTypesResult = {
  id: string;
  name: string | null;
  description: string | null;
};

type GetSpaceTypesOutput =
  | { types: GetSpaceTypesResult[]; hasMore: boolean }
  | { error: 'invalid_input' }
  | { error: 'lookup_failed' };

// A space can define more types than any one call should return — a real space
// was measured at 53. The old default of 25 handed back under half of them with
// nothing marking the list as partial, and "not in the list" then read as "does
// not exist": the assistant told a user there was no News Story type in a space
// holding 1,569 news stories. `hasMore` is what makes that distinction visible;
// `nameContains` is what lets the question be answered without paging.
const MAX_TYPES = 50;
const DEFAULT_TYPES = 50;

export const getSpaceTypes = tool({
  description:
    'List the entity Types defined in a space — the space\'s ontology. Call this whenever the user names a kind of thing tied to a space ("the news stories here", "the products in this space") so you can match their colloquial phrasing to the actual type name and id used in that space (a space might type its posts `News Story` rather than the generic `Article`). Returns `{ types, hasMore }`, each type as `{ id, name, description }`. Use the returned id directly as `typeId` for `searchGraph`, `setDataBlockFilters`, `createEntity`, etc. — do not re-search for it. **Looking for one specific type? Pass `nameContains` instead of scanning the list** — a space can define more types than fit in one call. **`hasMore: true` means you did NOT see every type**, so a name missing from the results is not evidence that the space lacks it: re-check with `nameContains` before telling the user a type does not exist.',
  inputSchema: jsonSchema<GetSpaceTypesInput>({
    type: 'object',
    properties: {
      spaceId: {
        type: 'string',
        description: 'Space id (dashless hex or uuid) whose types to list.',
      },
      nameContains: {
        type: 'string',
        minLength: 1,
        description:
          'Case-insensitive substring match on the type name. Use this to check whether a space has a particular type ("news", "project") rather than listing everything and reading through it — the answer is then complete rather than a page of it.',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 50,
        description: 'Max types to return (1–50, default 50).',
      },
    },
    required: ['spaceId'],
    additionalProperties: false,
  }),
  execute: async ({ spaceId, nameContains, limit }: GetSpaceTypesInput): Promise<GetSpaceTypesOutput> => {
    if (!isEntityId(spaceId)) return { error: 'invalid_input' };
    const effectiveLimit = Math.min(MAX_TYPES, Math.max(1, limit ?? DEFAULT_TYPES));
    const scopedSpaceId = normalizeEntityId(spaceId);
    const search = nameContains?.trim();
    try {
      const { entities: raw, hasNextPage } = await Effect.runPromise(
        getAllEntities({
          spaceId: scopedSpaceId,
          typeId: SystemIds.SCHEMA_TYPE,
          limit: effectiveLimit,
          ...(search ? { filter: { name: { includesInsensitive: search } } } : {}),
        })
      );

      const types = limitEntries(raw, effectiveLimit).map(entity => ({
        id: normalizeEntityId(entity.id),
        name: entity.name,
        description: entity.description ? truncateText(entity.description) : null,
      }));

      // From the connection, not from `types.length`: a full page is not proof
      // of more, and a short page is not proof of none.
      return { types, hasMore: hasNextPage };
    } catch (err) {
      console.error('[chat/getSpaceTypes] lookup failed', err);
      return { error: 'lookup_failed' };
    }
  },
});
