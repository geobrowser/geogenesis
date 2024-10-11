import { describe, expect, it } from 'vitest';

import { Entity } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { Triple } from '~/core/types';

import { aggregateChanges } from './change';
import { EntityChange } from './types';

function makeStubTextTriple(value: string): Triple {
  return {
    attributeId: 'text-attribute-from-test',
    attributeName: 'Text Attribute from Test',
    entityId: EntityId('1'),
    entityName: 'Entity Name From Text Test',
    id: EntityId('1-1'),
    space: 'text-space-from-test',
    value: {
      type: 'TEXT',
      value: value,
    },
  };
}

describe('Change', () => {
  it('diffs a text triple with different values', () => {
    const before: Entity = {
      id: EntityId('1'),
      types: [],
      description: null,
      name: 'Entity Name From Text Test',
      nameTripleSpaces: [],
      relationsOut: [],
      triples: [makeStubTextTriple('text-value-1-from-text')],
    };

    const after: Entity = {
      id: EntityId('1'),
      types: [],
      description: null,
      name: 'Entity Name From Text Test',
      nameTripleSpaces: [],
      relationsOut: [],
      triples: [makeStubTextTriple('text-value-2-from-text')],
    };

    const changes = aggregateChanges({
      spaceId: undefined,
      afterEntities: [after],
      beforeEntities: [before],
    });

    const expected: EntityChange[] = [
      {
        id: EntityId('1'),
        name: 'Entity Name From Text Test',
        blockChanges: [],
        changes: [
          {
            type: 'TEXT',
            attribute: {
              id: 'text-attribute-from-test',
              name: 'Text Attribute from Test',
            },
            after: {
              type: 'UPDATE',
              valueName: null,
              value: 'text-value-2-from-text',
            },
            before: {
              type: 'UPDATE',
              valueName: null,
              value: 'text-value-1-from-text',
            },
          },
        ],
      },
    ];

    expect(changes).toStrictEqual(expected);
  });
});
