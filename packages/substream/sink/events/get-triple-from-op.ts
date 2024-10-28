import type * as S from 'zapatos/schema';

import type { BlockEvent, Op, ValueType } from '../types';

export function getTripleFromOp(op: Op, spaceId: string, versionId: string, block: BlockEvent): S.triples.Insertable {
  const { entity, attribute } = op.triple;
  const space_id = spaceId;

  if (op.type === 'SET_TRIPLE') {
    const value = op.triple.value;
    const value_type = value.type;
    const values = getValue(value_type, value);

    return {
      version_id: versionId,
      space_id,
      entity_id: entity,
      attribute_id: attribute,
      value_type,
      created_at: block.timestamp,
      created_at_block: block.blockNumber,
      ...values,
    };
  }

  return {
    version_id: versionId,
    space_id,
    entity_id: entity,
    attribute_id: attribute,
    value_type: 'TEXT', // this doesn't matter for deletes, but we populate it anyway for more ergonomic types
    created_at: block.timestamp,
    created_at_block: block.blockNumber,
    entity_value_id: null,
    text_value: null,
    boolean_value: null,
  };
}

function getValue(value_type: ValueType, value: { type: ValueType; value: string }) {
  switch (value_type) {
    case 'ENTITY':
      return {
        text_value: null,
        entity_value_id: value.value,
        boolean_value: null,
      };

    case 'CHECKBOX': {
      // We filter valid boolean values before this function call so we can assume that
      // any values we get here are either 0 or 1
      const booleanValue = value.value === '0';

      return {
        text_value: null,
        entity_value_id: null,
        boolean_value: booleanValue,
      };
    }

    default:
      return {
        text_value: value.value,
        entity_value_id: null,
        boolean_value: null,
      };
  }
}
