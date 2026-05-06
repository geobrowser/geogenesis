import { jsonSchema, tool } from 'ai';

import { ENTITY_ID_PATTERN } from './shared';

const MAX_VALUE_CHARS = 10_000;

type SetEntityValueInput = {
  entityId: string;
  spaceId: string;
  propertyId: string;
  value: string;
};

export const setEntityValue = tool({
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
});

type DeleteEntityValueInput = {
  entityId: string;
  spaceId: string;
  propertyId: string;
};

export const deleteEntityValue = tool({
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
});

type AddPropertyToEntityInput = {
  entityId: string;
  spaceId: string;
  propertyId: string;
  initialValue?: string;
};

export const addPropertyToEntity = tool({
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
});
