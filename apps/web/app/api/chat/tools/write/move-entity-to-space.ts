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
  description: `Move an entity from one space to another. Mirrors the editor's "Move to existing space": clones every value and outgoing relation from the source space into the target space, then tombstones them in the source. Backlinks (incoming relations from other entities) stay in their original spaces. Caller must be a member of BOTH spaces.

NOTE: child blocks are NOT cascaded — only the entity's own values and outgoing relations are moved. If the entity has block children, they remain in the source space and the page will appear blank in the target. The editor has the same behavior; warn the user if the entity has blocks. Use \`cloneEntityToSpace\` if you want to keep a copy in the source.`,
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
    'Clone an entity from one space into another. Same as `moveEntityToSpace` minus the source-side delete — the entity ends up in BOTH spaces with its own per-space data. Caller must be a member of both spaces. Same child-block limitation as `moveEntityToSpace`: blocks are not cascaded.',
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
