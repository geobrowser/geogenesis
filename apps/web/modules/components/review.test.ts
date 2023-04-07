import { describe, expect, it } from 'vitest';

import { MockNetworkData } from '~/modules/io';
import { getChanges } from '~/modules/components/review';
import type { Action } from '~/modules/types';
import type { Changes } from '~/modules/components/review';

const STRING_ACTIONS: Array<Action> = [
  {
    type: 'createTriple',
    ...MockNetworkData.makeStubTriple('Devin'),
  },
  {
    type: 'editTriple',
    before: {
      type: 'deleteTriple',
      ...MockNetworkData.makeStubTriple('Alice'),
    },
    after: {
      type: 'createTriple',
      ...MockNetworkData.makeStubTriple('Alice'),
      value: { type: 'string', id: 'string:2', value: 'Alice-2' },
    },
  },
  {
    type: 'deleteTriple',
    ...MockNetworkData.makeStubTriple('Bob'),
  },
];

const STRING_CHANGES: Changes = {
  Devin: {
    entityName: 'Devin',
    entityRevisions: {
      name: {
        id: 'Devin',
        attributeName: 'Name',
        isDiff: false,
        after: ['Devin'],
      },
    },
  },
  Alice: {
    entityName: 'Alice',
    entityRevisions: {
      name: {
        id: 'Alice',
        attributeName: 'Name',
        isDiff: true,
        currentValue: 'Alice',
        differences: [
          {
            count: 1,
            value: 'Alice',
          },
          {
            count: 2,
            added: true,
            value: '-2',
          },
        ],
      },
    },
  },
  Bob: {
    entityName: 'Bob',
    entityRevisions: {
      name: {
        id: 'Bob',
        attributeName: 'Name',
        isDiff: false,
        before: ['Bob'],
      },
    },
  },
};

const ENTITY_ACTIONS: Array<Action> = [
  {
    type: 'createTriple',
    ...MockNetworkData.makeStubRelationAttribute('Devin'),
  },
  {
    type: 'deleteTriple',
    ...MockNetworkData.makeStubRelationAttribute('Bob'),
  },
];

const ENTITY_CHANGES: Changes = {
  Devin: {
    entityName: 'Devin',
    entityRevisions: {
      attribute: {
        id: 'Devin',
        attributeName: 'Types',
        isDiff: false,
        after: ['Text'],
      },
    },
  },
  Bob: {
    entityName: 'Bob',
    entityRevisions: {
      attribute: {
        id: 'Bob',
        attributeName: 'Types',
        isDiff: false,
        before: ['Text'],
      },
    },
  },
};

describe('Actions to changes transformer (string values)', () => {
  it('Generates changes from actions', () => {
    const [changes] = getChanges(STRING_ACTIONS);
    expect(changes).toEqual(STRING_CHANGES);
  });
});

describe('Actions to changes transformer (entity values)', () => {
  it('Generates changes from actions', () => {
    const [changes] = getChanges(ENTITY_ACTIONS);
    expect(changes).toEqual(ENTITY_CHANGES);
  });
});
