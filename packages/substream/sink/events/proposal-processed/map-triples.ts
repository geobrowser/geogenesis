import type * as S from 'zapatos/schema';

import type { Op } from '../proposals-created/parser';
import { type BlockEvent, type TripleOp } from '~/sink/types';

export interface OpWithCreatedBy {
  createdById: string;
  op: TripleOp;
  triple: S.triplesv2.Insertable;
}

export type SchemaTripleEdit = Parameters<typeof mapSchemaTriples>[0];

// @TODO: Do we squash actions in the new data model?
export function mapSchemaTriples(
  edit: { ops: Op[]; spaceId: string; createdById: string },
  block: BlockEvent
): OpWithCreatedBy[] {
  return edit.ops.map((op): OpWithCreatedBy => {
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
        value_type: 'TEXT', // this doesn't matter for deletes, but we populate it anyway for more ergonomic types
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
        is_stale: false,
      },
    };
  });
}
