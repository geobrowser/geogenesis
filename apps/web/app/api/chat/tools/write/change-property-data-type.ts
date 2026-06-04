import { jsonSchema, tool } from 'ai';

import type { SwitchableRenderableType } from '~/core/types';

import { ENTITY_ID_PATTERN } from './shared';

const PROPERTY_TYPES: readonly SwitchableRenderableType[] = [
  'TEXT',
  'URL',
  'RELATION',
  'IMAGE',
  'VIDEO',
  'BOOLEAN',
  'INTEGER',
  'FLOAT',
  'DECIMAL',
  'DATE',
  'DATETIME',
  'TIME',
  'POINT',
  'GEO_LOCATION',
  'PLACE',
  'ADDRESS',
];

type ChangePropertyDataTypeInput = {
  propertyId: string;
  spaceId: string;
  propertyType: SwitchableRenderableType;
};

export const changePropertyDataType = tool({
  description: `Change a property's data type (e.g. TEXT → INTEGER). Tombstones the property's existing Data Type and Renderable Type relations and writes new ones.

REFUSES if any active values currently use this property — the new type is incompatible with old values, and silently coercing would lose data. Before retrying, search for entities using the property (\`searchGraph({ typeId: propertyId })\` won't work — instead inspect candidate entities via \`getEntity\` and check their \`values[]\` for the propertyId), then \`deleteEntityValue\` on each. Only call this once the property has zero active values in this space.

Common property types: TEXT, URL, RELATION, IMAGE, VIDEO, BOOLEAN, INTEGER, FLOAT, DECIMAL, DATE, DATETIME, TIME, POINT, GEO_LOCATION, PLACE, ADDRESS.`,
  inputSchema: jsonSchema<ChangePropertyDataTypeInput>({
    type: 'object',
    properties: {
      propertyId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      propertyType: { type: 'string', enum: PROPERTY_TYPES as unknown as string[] },
    },
    required: ['propertyId', 'spaceId', 'propertyType'],
    additionalProperties: false,
  }),
});
