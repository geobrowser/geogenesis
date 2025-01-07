import { describe, expect, it } from 'vitest';

import { getTripleFromOp } from './get-triple-from-op';

describe('tripleFromOp', () => {
  it('should return a schema triple from a SET_TRIPLE op', () => {
    const triple = getTripleFromOp(
      {
        type: 'SET_TRIPLE',
        space: 'space-1',
        triple: {
          attribute: 'attribute-id',
          entity: 'entity-id',
          value: {
            type: 'TEXT',
            value: 'test value',
          },
        },
      },
      'entity-version-id',
      'attribute-version-id',
      {
        blockNumber: 0,
        cursor: '',
        timestamp: 0,
      }
    );

    expect(triple).toEqual({
      attribute_id: 'attribute-id',
      attribute_version_id: '0x5678',
      created_at: 0,
      created_at_block: 0,
      entity_id: 'entity-id',
      boolean_value: null,
      entity_value_id: null,
      space_id: 'space-1',
      text_value: 'test value',
      value_type: 'TEXT',
      version_id: 'entity-version-id',
    });
  });

  it('should return a schema triple from a DELETE_TRIPLE op', () => {
    const triple = getTripleFromOp(
      {
        type: 'DELETE_TRIPLE',
        space: 'space-1',
        triple: {
          attribute: 'attribute-id',
          entity: 'entity-id',
          value: {},
        },
      },
      'entity-version-id',
      'attribute-version-id',
      {
        blockNumber: 0,
        cursor: '',
        timestamp: 0,
      }
    );

    expect(triple).toEqual({
      attribute_id: 'attribute-id',
      attribute_version_id: 'attribute-version-id',
      created_at: 0,
      created_at_block: 0,
      entity_id: 'entity-id',
      boolean_value: null,
      entity_value_id: null,
      space_id: 'space-1',
      text_value: null,
      value_type: 'TEXT',
      version_id: 'entity-version-id',
    });
  });
});
