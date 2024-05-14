import type * as S from 'zapatos/schema';

import type { Edit } from '../proposals-created/parser';
import { type BlockEvent, TripleAction, type TripleOp, type TripleWithActionTuple } from '~/sink/types';
import { generateTripleId } from '~/sink/utils/id';
import type { Action } from '~/sink/zod';

export function mapTriplesWithActionType(
  entries: { space: string; actions: Action[] }[],
  timestamp: number,
  blockNumber: number
): TripleWithActionTuple[] {
  const triples: TripleWithActionTuple[] = entries.flatMap(e => {
    return e.actions.map(action => {
      const action_type = action.type;

      const entity_id = action.entityId;
      const attribute_id = action.attributeId;
      const value_type = action.value.type;
      const value_id = action.value.id;
      const space_id = e.space;

      const id = generateTripleId({
        space_id,
        entity_id,
        attribute_id,
        value_id,
      });

      const entity_value_id = value_type === 'entity' ? value_id : null;
      const collection_value_id = value_type === 'collection' ? value_id : null;

      const string_value =
        value_type === 'string' || value_type === 'image' || value_type === 'date' || value_type === 'url'
          ? action.value.value
          : null;

      const tupleType = action_type === 'deleteTriple' ? TripleAction.Delete : TripleAction.Create;

      return [
        tupleType,
        {
          id,
          entity_id,
          attribute_id,
          value_id,
          value_type,
          entity_value_id,
          string_value,
          space_id,
          created_at: timestamp,
          created_at_block: blockNumber,
          collection_value_id,
          is_stale: false,
        },
      ] as TripleWithActionTuple;
    });
  });

  return triples;
}

interface TripleWithActionV2 {
  createdById: string;
  op: TripleOp;
  triple: S.triplesv2.Insertable;
}

// @TODO: Do we squash actions in the new data model?
export function mapTriplesWithActionTypeV2(edit: Edit, block: BlockEvent): TripleWithActionV2[] {
  return edit.ops.map((op): TripleWithActionV2 => {
    const { entityId, attributeId } = op.payload;

    if (op.opType === 'SET_TRIPLE') {
      const value = op.payload.value;
      const entity_id = entityId;
      const attribute_id = attributeId;
      const value_type = value.type;
      const space_id = edit.spaceId;

      const entity_value_id = value_type === 'ENTITY' ? value.value : null;
      const collection_value_id = value_type === 'COLLECTION' ? value.value : null;
      const text_value = value_type === 'TEXT' || value_type === 'URL' ? value : null;

      return {
        createdById: edit.createdById,
        op: op.opType,
        triple: {
          space_id,
          entity_id,
          attribute_id,
          value_type,
          entity_value_id,
          text_value,
          collection_value_id,
          created_at: block.timestamp,
          created_at_block: block.blockNumber,
          is_stale: false,
        },
      };
    }

    const entity_id = entityId;
    const attribute_id = attributeId;
    const space_id = edit.spaceId;

    return {
      createdById: edit.createdById,
      op: op.opType,
      triple: {
        space_id,
        entity_id,
        attribute_id,
        value_type: 'TEXT', // this doesn't matter for deletes, but we populate it anyway for types
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
        is_stale: false,
      },
    };
  });
}
