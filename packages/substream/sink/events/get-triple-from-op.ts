import type * as S from 'zapatos/schema';

import type { BlockEvent, Op } from '../types';

export function getTripleFromOp(op: Op, spaceId: string, block: BlockEvent): S.triples.Insertable {
  const { entity, attribute } = op.triple;
  const space_id = spaceId;

  if (op.type === 'SET_TRIPLE') {
    const value = op.triple.value;

    const value_type = value.type;

    const entity_value_id = value_type === 'ENTITY' ? value.value : null;
    const collection_value_id = value_type === 'COLLECTION' ? value.value : null;
    const text_value = value_type === 'TEXT' || value_type === 'URL' ? value.value : null;

    return {
      space_id,
      entity_id: entity,
      attribute_id: attribute,
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
    entity_id: entity,
    attribute_id: attribute,
    value_type: 'TEXT', // this doesn't matter for deletes, but we populate it anyway for more ergonomic types
    created_at: block.timestamp,
    created_at_block: block.blockNumber,
    collection_value_id: null,
    entity_value_id: null,
    text_value: null,
    is_stale: false,
  };
}
