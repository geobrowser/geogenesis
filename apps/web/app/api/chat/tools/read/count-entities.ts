import { jsonSchema, tool } from 'ai';

import { runGeoGraphql } from '../../geo-query/graphql';
import { isEntityId, normalizeEntityId } from './shared';

type Input = { spaceId: string; typeId?: string };

export const countEntities = tool({
  description:
    'Return the exact number of distinct entities in a space, optionally filtered by one type. Use this for counts instead of listing entities or adding counts for overlapping types. Without typeId, the total includes all graph entities in the space, including schema and internal entities; explain this scope. For the number of ontology types, pass the Type entity id as typeId.',
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
        ? 'Distinct entities of this type in this space.'
        : 'All distinct graph entities in this space, including schema and internal entities.',
    };
  },
});
