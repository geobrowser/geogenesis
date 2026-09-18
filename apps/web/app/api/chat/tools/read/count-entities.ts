import { jsonSchema, tool } from 'ai';

import { runGeoGraphql } from '../../geo-query/graphql';
import { isEntityId, normalizeEntityId } from './shared';

type Input = { spaceId: string; typeId?: string };

export const countEntities = tool({
  description:
    'Return the exact number of distinct published entities in a space, optionally filtered by one type. Omit typeId when the user asks for all entities; the total includes schema and internal graph entities, so explain that scope. Do not list entities or add overlapping type counts to compute a total. For the number of ontology types, pass the Type entity id as typeId.',
  inputSchema: jsonSchema<Input>({
    type: 'object',
    properties: { spaceId: { type: 'string' }, typeId: { type: 'string' } },
    required: ['spaceId'],
    additionalProperties: false,
  }),
  execute: async ({ spaceId, typeId }: Input, { abortSignal }) => {
    if (!isEntityId(spaceId) || (typeId !== undefined && !isEntityId(typeId))) return { error: 'invalid_input' };
    const space = normalizeEntityId(spaceId);
    const type = typeId ? normalizeEntityId(typeId) : null;
    // Use the API's top-level selectors. Live checks show this count path is
    // fast without a type; filter.spaceIds scans the computed entity field and
    // can time out even for an empty space. first: 0 avoids fetching any rows.
    const result = await runGeoGraphql(
      `{ entitiesConnection(spaceId: "${space}"${type ? `, typeId: "${type}"` : ''}, first: 0) { totalCount } }`,
      undefined,
      abortSignal
    );
    if (!result.ok) return { error: 'lookup_failed', message: result.error };
    const count = (result.data as { entitiesConnection?: { totalCount?: unknown } })?.entitiesConnection?.totalCount;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return { error: 'lookup_failed' };
    return {
      spaceId: space,
      typeId: type,
      totalCount: count,
      exact: true,
      scope: type
        ? 'Distinct published entities of this type in this space.'
        : 'All distinct published graph entities in this space, including schema and internal entities.',
    };
  },
});
