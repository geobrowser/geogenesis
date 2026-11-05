import { jsonSchema, tool } from 'ai';

import { ENTITY_ID_PATTERN } from './shared';

type MoveEntityToSpaceInput = {
  entityId: string;
  // Source space the entity is being moved out of. Named `spaceId` (not
  // `sourceSpaceId`) so the dispatcher's standard auth flow validates it.
  spaceId: string;
  targetSpaceId: string;
};

export const moveEntityToSpace = tool({
  description: `Move an entity from one space to another. Same as the editor's "Move to existing space": the entity's values and outgoing relations, and its blocks and tabs, are copied into the target space and removed from the source. Related entities are not copied; links to them keep pointing at the source space. Links to the moved entity stay where they are, and ones in the source space are pointed at the target. A block another entity still uses stays in the source. Caller must be a member of BOTH spaces. Use \`cloneEntityToSpace\` if you want to keep a copy in the source.`,
  inputSchema: jsonSchema<MoveEntityToSpaceInput>({
    type: 'object',
    properties: {
      entityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      targetSpaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
    },
    required: ['entityId', 'spaceId', 'targetSpaceId'],
    additionalProperties: false,
  }),
});

type CloneEntityToSpaceInput = {
  entityId: string;
  spaceId: string;
  targetSpaceId: string;
};

export const cloneEntityToSpace = tool({
  description:
    'Clone an entity from one space into another. Same as `moveEntityToSpace` minus the source-side delete — the entity ends up in BOTH spaces with its own per-space data. Caller must be a member of both spaces. Only the entity itself is copied: its blocks and tabs are not, so a page can appear blank in the target.',
  inputSchema: jsonSchema<CloneEntityToSpaceInput>({
    type: 'object',
    properties: {
      entityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      targetSpaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
    },
    required: ['entityId', 'spaceId', 'targetSpaceId'],
    additionalProperties: false,
  }),
});
