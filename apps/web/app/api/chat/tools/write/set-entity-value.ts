import { jsonSchema, tool } from 'ai';
import * as Effect from 'effect/Effect';

import type { EditToolOutput } from '~/core/chat/edit-types';
import { getEntity, getProperty } from '~/core/io/queries';

import type { WriteContext } from './context';
import {
  ENTITY_ID_PATTERN,
  invalid,
  isEntityId,
  normalizeEntityId,
  notAuthorized,
  notFound,
  writePrecheck,
  wrongType,
} from './shared';

const MAX_VALUE_CHARS = 10_000;

type SetEntityValueInput = {
  entityId: string;
  spaceId: string;
  propertyId: string;
  value: string;
};

export function buildSetEntityValueTool(context: WriteContext) {
  return tool({
    description:
      'Set or update a property value on an entity. Use when the user wants to fill in a field, rename an entity, change a description, etc. For RELATION-type properties use setEntityRelation instead. Before calling, use searchGraph to find the property id if the user gave you a name.',
    inputSchema: jsonSchema<SetEntityValueInput>({
      type: 'object',
      properties: {
        entityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        propertyId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        value: {
          type: 'string',
          maxLength: MAX_VALUE_CHARS,
          description: 'Raw string value. Numbers/booleans/dates are passed as strings.',
        },
      },
      required: ['entityId', 'spaceId', 'propertyId', 'value'],
      additionalProperties: false,
    }),
    execute: async (input: SetEntityValueInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.entityId) || !isEntityId(input.spaceId) || !isEntityId(input.propertyId)) {
        return invalid('ids must be 32-char hex or dashed uuid');
      }
      if (input.value.length > MAX_VALUE_CHARS) return invalid('value too long');

      const entityId = normalizeEntityId(input.entityId);
      const spaceId = normalizeEntityId(input.spaceId);
      const propertyId = normalizeEntityId(input.propertyId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      try {
        const [property, entity] = await Promise.all([
          Effect.runPromise(getProperty(propertyId)),
          Effect.runPromise(getEntity(entityId, spaceId)),
        ]);
        if (!property) return notFound('property', propertyId);

        if (property.dataType === 'RELATION') {
          return wrongType('property is RELATION-typed; use setEntityRelation instead');
        }

        // Reject hallucinated / cross-space entity ids — staging a value
        // against an entity that isn't in `spaceId` would either silently
        // create a stub on publish or attach to the wrong space.
        if (!entity) return notFound('entity', entityId);

        return {
          ok: true,
          intent: {
            kind: 'setValue',
            entityId,
            spaceId,
            propertyId,
            propertyName: property.name ?? 'Property',
            dataType: property.dataType,
            value: input.value,
            entityName: entity.name ?? null,
          },
        };
      } catch (err) {
        console.error('[chat/setEntityValue] lookup failed', err);
        return { ok: false, error: 'lookup_failed' };
      }
    },
  });
}

type DeleteEntityValueInput = {
  entityId: string;
  spaceId: string;
  propertyId: string;
};

export function buildDeleteEntityValueTool(context: WriteContext) {
  return tool({
    description:
      "Remove a property value from an entity. The property itself is unaffected — only this entity's value for it is removed. For RELATION-type properties use deleteEntityRelation instead.",
    inputSchema: jsonSchema<DeleteEntityValueInput>({
      type: 'object',
      properties: {
        entityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        propertyId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      },
      required: ['entityId', 'spaceId', 'propertyId'],
      additionalProperties: false,
    }),
    execute: async (input: DeleteEntityValueInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.entityId) || !isEntityId(input.spaceId) || !isEntityId(input.propertyId)) {
        return invalid();
      }
      const entityId = normalizeEntityId(input.entityId);
      const spaceId = normalizeEntityId(input.spaceId);
      const propertyId = normalizeEntityId(input.propertyId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      return {
        ok: true,
        intent: { kind: 'deleteValue', entityId, spaceId, propertyId },
      };
    },
  });
}

type AddPropertyToEntityInput = {
  entityId: string;
  spaceId: string;
  propertyId: string;
  initialValue?: string;
};

export function buildAddPropertyToEntityTool(context: WriteContext) {
  return tool({
    description:
      'Add a property to an entity that doesn\'t yet have a value for it. If the user\'s phrasing is "add a Title field to this page", use this. With initialValue set, the new field starts with that value; omit it to leave the field empty. Use setEntityValue if the entity already has a value for the property.',
    inputSchema: jsonSchema<AddPropertyToEntityInput>({
      type: 'object',
      properties: {
        entityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        propertyId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        initialValue: {
          type: 'string',
          maxLength: MAX_VALUE_CHARS,
          description: 'Optional initial string value for the property.',
        },
      },
      required: ['entityId', 'spaceId', 'propertyId'],
      additionalProperties: false,
    }),
    execute: async (input: AddPropertyToEntityInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.entityId) || !isEntityId(input.spaceId) || !isEntityId(input.propertyId)) {
        return invalid();
      }
      if (input.initialValue !== undefined && input.initialValue.length > MAX_VALUE_CHARS) {
        return invalid('initialValue too long');
      }

      const entityId = normalizeEntityId(input.entityId);
      const spaceId = normalizeEntityId(input.spaceId);
      const propertyId = normalizeEntityId(input.propertyId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      try {
        const [property, entity] = await Promise.all([
          Effect.runPromise(getProperty(propertyId)),
          Effect.runPromise(getEntity(entityId, spaceId)),
        ]);
        if (!property) return notFound('property', propertyId);

        if (property.dataType === 'RELATION') {
          return wrongType('property is RELATION-typed; use setEntityRelation instead');
        }

        if (!entity) return notFound('entity', entityId);

        return {
          ok: true,
          intent: {
            kind: 'setValue',
            entityId,
            spaceId,
            propertyId,
            propertyName: property.name ?? 'Property',
            dataType: property.dataType,
            value: input.initialValue ?? '',
            entityName: entity.name ?? null,
          },
        };
      } catch (err) {
        console.error('[chat/addPropertyToEntity] lookup failed', err);
        return { ok: false, error: 'lookup_failed' };
      }
    },
  });
}
