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

type CreatePropertyInput = {
  spaceId: string;
  name: string;
  propertyType: SwitchableRenderableType;
};

export const createProperty = tool({
  description:
    'Create a new property (a typed attribute) in a space. Before calling, always searchGraph first to see if a suitable property already exists — reuse existing ones; only create when there is no match. Use `propertyType` to pick the data kind: TEXT for free text, URL for links, RELATION for typed edges to other entities, IMAGE/VIDEO for media, BOOLEAN for checkboxes, INTEGER/FLOAT/DECIMAL for numbers, DATE/DATETIME/TIME for temporal values, POINT/GEO_LOCATION/PLACE/ADDRESS for locations.',
  inputSchema: jsonSchema<CreatePropertyInput>({
    type: 'object',
    properties: {
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      name: { type: 'string', minLength: 1, maxLength: 120 },
      propertyType: { type: 'string', enum: PROPERTY_TYPES as unknown as string[] },
    },
    required: ['spaceId', 'name', 'propertyType'],
    additionalProperties: false,
  }),
});
