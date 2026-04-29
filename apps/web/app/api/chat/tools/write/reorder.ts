import { jsonSchema, tool } from 'ai';

import type { EditToolOutput, RelativePosition } from '~/core/chat/edit-types';

import type { WriteContext } from './context';
import {
  ENTITY_ID_PATTERN,
  invalid,
  isEntityId,
  normalizeEntityId,
  notAuthorized,
  resolveBlocksEdge,
  writePrecheck,
} from './shared';

// Flat enum + referenceId at the input layer: AI SDK has quirks with
// discriminated-union JSON schemas.
type MoveBlockInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
  target: 'first' | 'last' | 'before' | 'after';
  referenceBlockId?: string;
};

type MoveRelationInput = {
  fromEntityId: string;
  typeId: string;
  toEntityId: string;
  spaceId: string;
  target: 'first' | 'last' | 'before' | 'after';
  referenceToEntityId?: string;
};

function resolveRelativePosition(
  target: 'first' | 'last' | 'before' | 'after',
  referenceId: string | undefined
): RelativePosition | { error: string } {
  if (target === 'first') return { kind: 'first' };
  if (target === 'last') return { kind: 'last' };
  if (!referenceId) return { error: `target=${target} requires a reference id` };
  if (!isEntityId(referenceId)) return { error: 'reference id is not a valid entity id' };
  return { kind: target, referenceId: normalizeEntityId(referenceId) };
}

export function buildMoveBlockTool(context: WriteContext) {
  return tool({
    description:
      'Reorder an existing block on a page. Use when the user asks to "move the X block up / down / to the top / above Y". Pass `target: "first" | "last"` for endpoint moves, or `target: "before" | "after"` plus `referenceBlockId` for adjacent placement. The dispatcher updates the BLOCKS relation\'s position field in place, so data-block views / filters stay attached.',
    inputSchema: jsonSchema<MoveBlockInput>({
      type: 'object',
      properties: {
        blockId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        parentEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        target: { type: 'string', enum: ['first', 'last', 'before', 'after'] },
        referenceBlockId: {
          type: 'string',
          pattern: ENTITY_ID_PATTERN,
          description: 'Required when target is "before" or "after". Ignored for "first" / "last".',
        },
      },
      required: ['blockId', 'parentEntityId', 'spaceId', 'target'],
      additionalProperties: false,
    }),
    execute: async (input: MoveBlockInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
        return invalid();
      }
      const position = resolveRelativePosition(input.target, input.referenceBlockId);
      if ('error' in position) return invalid(position.error);

      const blockId = normalizeEntityId(input.blockId);
      const parentEntityId = normalizeEntityId(input.parentEntityId);
      const spaceId = normalizeEntityId(input.spaceId);
      if (position.kind === 'before' || position.kind === 'after') {
        if (position.referenceId === blockId) return invalid('referenceBlockId must be a different block');
      }

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      const edgeGate = await resolveBlocksEdge(context, parentEntityId, blockId, spaceId);
      if (edgeGate) return edgeGate;

      return {
        ok: true,
        intent: { kind: 'moveBlock', blockId, parentEntityId, spaceId, position },
      };
    },
  });
}

export function buildMoveRelationTool(context: WriteContext) {
  return tool({
    description:
      "Reorder a relation within a set (e.g. move a Tags entry before another, or push a relation to the top of its group). Pass the triple that identifies the relation — `fromEntityId` + `typeId` + `toEntityId` — and the target position. The dispatcher updates the existing relation's position without minting a new relation, so relation-entity ids (and any properties hanging off them) are preserved.",
    inputSchema: jsonSchema<MoveRelationInput>({
      type: 'object',
      properties: {
        fromEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        typeId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        toEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        target: { type: 'string', enum: ['first', 'last', 'before', 'after'] },
        referenceToEntityId: {
          type: 'string',
          pattern: ENTITY_ID_PATTERN,
          description:
            'Required when target is "before" or "after". The toEntity id of the relation to anchor against.',
        },
      },
      required: ['fromEntityId', 'typeId', 'toEntityId', 'spaceId', 'target'],
      additionalProperties: false,
    }),
    execute: async (input: MoveRelationInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (
        !isEntityId(input.fromEntityId) ||
        !isEntityId(input.typeId) ||
        !isEntityId(input.toEntityId) ||
        !isEntityId(input.spaceId)
      ) {
        return invalid();
      }
      const position = resolveRelativePosition(input.target, input.referenceToEntityId);
      if ('error' in position) return invalid(position.error);

      const fromEntityId = normalizeEntityId(input.fromEntityId);
      const typeId = normalizeEntityId(input.typeId);
      const toEntityId = normalizeEntityId(input.toEntityId);
      const spaceId = normalizeEntityId(input.spaceId);
      if (position.kind === 'before' || position.kind === 'after') {
        if (position.referenceId === toEntityId) return invalid('referenceToEntityId must be a different relation');
      }

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      return {
        ok: true,
        intent: { kind: 'moveRelation', fromEntityId, typeId, toEntityId, spaceId, position },
      };
    },
  });
}
