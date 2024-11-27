import type * as S from 'zapatos/schema';

import type { BlockEvent, Op, ValueType } from '../types';

/**
 * @NOTE that we currently merge ops from previous versions of entities into new versions. If
 * an entity has triples from multiple spaces we need to keep the space_id of the original
 * triple instead of changing it to the space id of the edit being processed.
 */
export function getTripleFromOp(op: Op, versionId: string, block: BlockEvent): S.triples.Insertable {
  const { entity, attribute } = op.triple;

  if (op.type === 'SET_TRIPLE') {
    const value = op.triple.value;
    const value_type = value.type;
    const values = getValue(value_type, value);

    return {
      version_id: versionId,
      space_id: op.space,
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
    space_id: op.space,
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
  // @TODO: Map graph:// URI triples to be relational

  switch (value_type) {
    case 'CHECKBOX': {
      // We filter valid boolean values before this function call so we can assume that
      // any values we get here are either 0 or 1
      const booleanValue = value.value === '0' ? false : true;

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
