import { jsonSchema, tool } from 'ai';
import * as Effect from 'effect/Effect';

import type { EditToolOutput } from '~/core/chat/edit-types';
import { getEntity, getProperty } from '~/core/io/queries';

import type { WriteContext } from './context';
import {
  ENTITY_ID_PATTERN,
  alreadyExists,
  invalid,
  isEntityId,
  normalizeEntityId,
  notAuthorized,
  notFound,
  writePrecheck,
  wrongType,
} from './shared';

type SetEntityRelationInput = {
  fromEntityId: string;
  spaceId: string;
  typeId: string;
  toEntityId: string;
};

export function buildSetEntityRelationTool(context: WriteContext) {
  return tool({
    description:
      'Add a typed relation from one entity to another — e.g. link a movie to its director, tag a page with a topic. `typeId` must be a property whose dataType is RELATION. Both fromEntity and toEntity must exist; use searchGraph or getEntity to resolve ids.',
    inputSchema: jsonSchema<SetEntityRelationInput>({
      type: 'object',
      properties: {
        fromEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        typeId: { type: 'string', pattern: ENTITY_ID_PATTERN, description: 'A RELATION-typed property id.' },
        toEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      },
      required: ['fromEntityId', 'spaceId', 'typeId', 'toEntityId'],
      additionalProperties: false,
    }),
    execute: async (input: SetEntityRelationInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (
        !isEntityId(input.fromEntityId) ||
        !isEntityId(input.spaceId) ||
        !isEntityId(input.typeId) ||
        !isEntityId(input.toEntityId)
      ) {
        return invalid();
      }

      const fromEntityId = normalizeEntityId(input.fromEntityId);
      const spaceId = normalizeEntityId(input.spaceId);
      const typeId = normalizeEntityId(input.typeId);
      const toEntityId = normalizeEntityId(input.toEntityId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      try {
        const [property, fromEntity, toEntity] = await Promise.all([
          Effect.runPromise(getProperty(typeId)),
          Effect.runPromise(getEntity(fromEntityId, spaceId)),
          Effect.runPromise(getEntity(toEntityId)),
        ]);

        if (!property) return notFound('property', typeId);
        if (property.dataType !== 'RELATION') {
          return wrongType('typeId must be a RELATION-typed property; use setEntityValue for scalar fields');
        }
        // Reject hallucinated / cross-space `fromEntityId`. Without this the
        // dedup loop below silently runs against `[]` and we stage a relation
        // pointing out of an entity that doesn't exist in `spaceId`.
        if (!fromEntity) return notFound('entity', fromEntityId);
        if (!toEntity) return notFound('entity', toEntityId);

        // Dedupe — mergeRelations only collapses tombstoned matches, so
        // writing a second active relation with the same (type, to) triple
        // would render as two edges. Surface the existing edge so the model
        // can acknowledge "already set" instead of creating a duplicate.
        const hasExisting = fromEntity.relations.some(
          r => r.type.id === typeId && r.toEntity.id === toEntityId && r.spaceId === spaceId && !r.isDeleted
        );
        if (hasExisting) {
          return alreadyExists(`${fromEntity.name ?? fromEntityId} already has this relation`);
        }

        return {
          ok: true,
          intent: {
            kind: 'setRelation',
            fromEntityId,
            fromEntityName: fromEntity.name ?? null,
            spaceId,
            typeId,
            typeName: property.name,
            toEntityId,
            toEntityName: toEntity.name,
          },
        };
      } catch (err) {
        console.error('[chat/setEntityRelation] lookup failed', err);
        return { ok: false, error: 'lookup_failed' };
      }
    },
  });
}

type DeleteEntityRelationInput = {
  fromEntityId: string;
  spaceId: string;
  typeId: string;
  toEntityId: string;
};

export function buildDeleteEntityRelationTool(context: WriteContext) {
  return tool({
    description:
      'Remove a specific relation edge from one entity to another. Identified by the (fromEntityId, typeId, toEntityId) triple so we do not need the relation id itself.',
    inputSchema: jsonSchema<DeleteEntityRelationInput>({
      type: 'object',
      properties: {
        fromEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        typeId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        toEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      },
      required: ['fromEntityId', 'spaceId', 'typeId', 'toEntityId'],
      additionalProperties: false,
    }),
    execute: async (input: DeleteEntityRelationInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (
        !isEntityId(input.fromEntityId) ||
        !isEntityId(input.spaceId) ||
        !isEntityId(input.typeId) ||
        !isEntityId(input.toEntityId)
      ) {
        return invalid();
      }

      const fromEntityId = normalizeEntityId(input.fromEntityId);
      const spaceId = normalizeEntityId(input.spaceId);
      const typeId = normalizeEntityId(input.typeId);
      const toEntityId = normalizeEntityId(input.toEntityId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      return {
        ok: true,
        intent: { kind: 'deleteRelation', fromEntityId, spaceId, typeId, toEntityId },
      };
    },
  });
}
