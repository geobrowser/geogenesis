import { describe, expect, it } from 'vitest';

import { getTripleFromOp } from './get-triple-from-op';

describe('tripleFromOp', () => {
  it('should return a schema triple from a SET_TRIPLE op', () => {
    const triple = getTripleFromOp(
      {
        opType: 'SET_TRIPLE',
        triple: {
          attributeId: 'attribute-id',
          entityId: 'entity-id',
          value: {
            type: 'TEXT',
            value: 'test value',
          },
        },
      },
      '0x1234',
      {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      }
    );

    expect(triple).toEqual({
      attribute_id: 'attribute-id',
      collection_value_id: null,
      created_at: 0,
      created_at_block: 0,
      entity_id: 'entity-id',
      entity_value_id: null,
      is_stale: false,
      space_id: '0x1234',
      text_value: 'test value',
      value_type: 'TEXT',
    });
  });

  it('should return a schema triple from a DELETE_TRIPLE op', () => {
    const triple = getTripleFromOp(
      {
        opType: 'DELETE_TRIPLE',
        triple: {
          attributeId: 'attribute-id',
          entityId: 'entity-id',
          value: {},
        },
      },
      '0x1234',
      {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      }
    );

    expect(triple).toEqual({
      attribute_id: 'attribute-id',
      collection_value_id: null,
      created_at: 0,
      created_at_block: 0,
      entity_id: 'entity-id',
      entity_value_id: null,
      is_stale: false,
      space_id: '0x1234',
      text_value: null,
      value_type: 'TEXT',
    });
  });
});
