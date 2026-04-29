import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { jsonSchema, tool } from 'ai';

import type { EditToolOutput } from '~/core/chat/edit-types';

import type { WriteContext } from './context';
import {
  ENTITY_ID_PATTERN,
  invalid,
  isEntityId,
  normalizeDescription,
  normalizeEntityId,
  normalizeName,
  notAuthorized,
  writePrecheck,
} from './shared';

const MAX_NAME_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 2_000;
const MAX_TYPES = 5;

type CreateEntityInput = {
  spaceId: string;
  name: string;
  description?: string;
  typeIds?: string[];
};

export function buildCreateEntityTool(context: WriteContext) {
  return tool({
    description:
      'Create a brand-new entity in a space. Use this when the user asks to "create a new X" / "make a Y entity" and no matching entity exists yet — always `searchGraph` first to avoid duplicating an existing entity. Pass `name` (required), optional `description`, and optional `typeIds` (entity ids of the types to tag it with — look them up via `searchGraph({ query: name, typeId: SystemIds.TYPE })` or `getEntity` on a similar entity\'s `types`). Returns the new entity id so you can immediately address it with other write tools (setEntityValue, setEntityRelation, createBlock).',
    inputSchema: jsonSchema<CreateEntityInput>({
      type: 'object',
      properties: {
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        name: { type: 'string', description: 'Required. Human-readable name for the new entity.' },
        description: { type: 'string' },
        typeIds: {
          type: 'array',
          items: { type: 'string', pattern: ENTITY_ID_PATTERN },
          description: `Up to ${MAX_TYPES} type entity ids. Typical flow: searchGraph for the type name (e.g. "Concept"), take its id.`,
        },
      },
      required: ['spaceId', 'name'],
      additionalProperties: false,
    }),
    execute: async (input: CreateEntityInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;

      if (!isEntityId(input.spaceId)) return invalid();
      const name = input.name ? normalizeName(input.name) : '';
      if (!name) return invalid('name is required');
      if (name.length > MAX_NAME_CHARS) return invalid('name too long');
      const description = input.description ? normalizeDescription(input.description) : undefined;
      if (description && description.length > MAX_DESCRIPTION_CHARS) return invalid('description too long');

      const typeIds: string[] = [];
      if (input.typeIds) {
        if (input.typeIds.length > MAX_TYPES) return invalid(`typeIds exceeds limit of ${MAX_TYPES}`);
        for (const id of input.typeIds) {
          if (!isEntityId(id)) return invalid(`typeIds contains invalid id ${id}`);
          typeIds.push(normalizeEntityId(id));
        }
      }

      const spaceId = normalizeEntityId(input.spaceId);
      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      return {
        ok: true,
        intent: {
          kind: 'createEntity',
          entityId: IdUtils.generate(),
          spaceId,
          name,
          ...(description ? { description } : {}),
          ...(typeIds.length > 0 ? { typeIds } : {}),
        },
      };
    },
  });
}
