import { jsonSchema, tool } from 'ai';
import * as Effect from 'effect/Effect';

import { getEntity, getSpace } from '~/core/io/queries';

import { MAX_RESULT_ENTRIES, isEntityId, limitEntries, normalizeEntityId, truncateText } from './shared';

type GetEntityInput = {
  entityId: string;
  spaceId?: string;
};

type GetEntityOutput =
  | {
      id: string;
      name: string | null;
      description: string | null;
      spaceId: string | null;
      spaceName: string | null;
      types: string[];
      values: Array<{ propertyName: string | null; value: string; dataType: string }>;
      relations: Array<{ typeName: string | null; toEntityId: string; toEntityName: string | null }>;
    }
  | { error: 'not_found' | 'invalid_id' | 'lookup_failed' };

export const getEntityTool = tool({
  description:
    'Fetch a single entity from the Geo knowledge graph by id, with its property values and outgoing relations. Use after searchGraph to expand a result, or when the user gives you an explicit entity id. Long values are truncated.',
  inputSchema: jsonSchema<GetEntityInput>({
    type: 'object',
    properties: {
      entityId: { type: 'string', description: 'The entity id (dashless hex or uuid).' },
      spaceId: { type: 'string', description: 'Optional — space id to scope the lookup.' },
    },
    required: ['entityId'],
    additionalProperties: false,
  }),
  execute: async ({ entityId, spaceId }: GetEntityInput): Promise<GetEntityOutput> => {
    if (!isEntityId(entityId)) {
      return { error: 'invalid_id' };
    }
    const normalizedId = normalizeEntityId(entityId);
    const normalizedSpaceId = spaceId && isEntityId(spaceId) ? normalizeEntityId(spaceId) : undefined;

    try {
      const entity = await Effect.runPromise(getEntity(normalizedId, normalizedSpaceId));
      if (!entity) return { error: 'not_found' };

      const primarySpaceId = normalizedSpaceId ?? entity.spaces[0];
      let spaceName: string | null = null;
      if (primarySpaceId) {
        try {
          const space = await Effect.runPromise(getSpace(primarySpaceId));
          spaceName = space?.entity.name ?? null;
        } catch {
          spaceName = null;
        }
      }

      const values = limitEntries(entity.values, MAX_RESULT_ENTRIES).map(value => ({
        propertyName: value.property?.name ?? null,
        value: truncateText(value.value ?? ''),
        dataType: value.property?.dataType ?? 'TEXT',
      }));

      const relations = limitEntries(entity.relations, MAX_RESULT_ENTRIES).map(relation => ({
        typeName: relation.type.name,
        toEntityId: normalizeEntityId(relation.toEntity.id),
        toEntityName: relation.toEntity.name,
      }));

      return {
        id: normalizedId,
        name: entity.name,
        description: entity.description,
        spaceId: primarySpaceId ?? null,
        spaceName,
        types: entity.types.map(t => t.name).filter((n): n is string => typeof n === 'string' && n.length > 0),
        values,
        relations,
      };
    } catch (err) {
      console.error('[chat/getEntity] lookup failed', err);
      return { error: 'lookup_failed' };
    }
  },
});
