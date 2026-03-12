import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';

import { actionsCountAtom, relationsAtom, valuesAtom } from './atoms';

describe('import atoms', () => {
  it('actionsCountAtom counts both values and relations', () => {
    const store = createStore();

    store.set(valuesAtom, [
      {
        id: 'value-1',
        entity: { id: 'entity-1', name: 'Entity 1' },
        property: { id: 'prop-1', name: 'Prop 1', dataType: 'TEXT' },
        spaceId: 'space-1',
        value: 'A',
        isLocal: true,
      },
    ]);
    store.set(relationsAtom, [
      {
        id: 'relation-1',
        entityId: 'entity-1',
        type: { id: 'type-1', name: 'Type 1' },
        fromEntity: { id: 'entity-1', name: 'Entity 1' },
        toEntity: { id: 'entity-2', name: 'Entity 2', value: 'entity-2' },
        renderableType: 'RELATION',
        spaceId: 'space-1',
        position: '1',
        isLocal: true,
      },
    ]);

    expect(store.get(actionsCountAtom)).toBe('2');
  });
});
