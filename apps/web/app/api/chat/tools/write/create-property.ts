import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { jsonSchema, tool } from 'ai';

import type { EditToolOutput } from '~/core/chat/edit-types';
import type { SwitchableRenderableType } from '~/core/types';
import { mapPropertyType } from '~/core/utils/property/properties';

import type { WriteContext } from './context';
import {
  ENTITY_ID_PATTERN,
  invalid,
  isEntityId,
  normalizeEntityId,
  normalizeName,
  notAuthorized,
  writePrecheck,
} from './shared';

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

export function buildCreatePropertyTool(context: WriteContext) {
  return tool({
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
    execute: async (input: CreatePropertyInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.spaceId)) return invalid();
      const name = normalizeName(input.name);
      if (!name) return invalid('name cannot be empty');
      if (!PROPERTY_TYPES.includes(input.propertyType)) return invalid('invalid propertyType');

      const spaceId = normalizeEntityId(input.spaceId);
      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      const { baseDataType, renderableTypeId } = mapPropertyType(input.propertyType);
      const propertyId = IdUtils.generate();

      return {
        ok: true,
        intent: {
          kind: 'createProperty',
          propertyId,
          spaceId,
          name,
          dataType: baseDataType,
          renderableTypeId,
        },
      };
    },
  });
}
