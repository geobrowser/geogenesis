import type * as S from 'zapatos/schema';

import type { BlockEvent, Op } from '../types';

export function triplesFromOp(op: Op, spaceId: string, block: BlockEvent): S.triples.Insertable {
  const { entityId, attributeId } = op.payload;
  const entity_id = entityId;
  const attribute_id = attributeId;
  const space_id = spaceId;

  if (op.opType === 'SET_TRIPLE') {
    const value = op.payload.value;

    const value_type = value.type;

    const entity_value_id = value_type === 'ENTITY' ? value.value : null;
    const collection_value_id = value_type === 'COLLECTION' ? value.value : null;
    const text_value = value_type === 'TEXT' || value_type === 'URL' ? value.value : null;

    return {
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
    };
  }

  return {
    space_id,
    entity_id,
    attribute_id,
    value_type: 'TEXT', // this doesn't matter for deletes, but we populate it anyway for more ergonomic types
    created_at: block.timestamp,
    created_at_block: block.blockNumber,
    is_stale: false,
  };
}
