import { describe, expect } from 'vitest';

import { makeStubTriple } from '~/modules/services/mock-network';
import { getChanges } from '~/modules/components/review';
import type { Action } from '~/modules/types';
import type { Changes } from '~/modules/components/review';

const ACTIONS: Array<Action> = [
  {
    type: 'createTriple',
    ...makeStubTriple('Devin'),
  },
  {
    type: 'editTriple',
    before: {
      type: 'deleteTriple',
      ...makeStubTriple('Alice'),
    },
    after: {
      type: 'createTriple',
      ...makeStubTriple('Alice'),
      value: { type: 'string', id: 'string:2', value: 'Alice-2' },
    },
  },
  {
    type: 'deleteTriple',
    ...makeStubTriple('Bob'),
  },
];

const CHANGES: Changes = {
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

describe('Actions to changes transformer', () => {
  it('Generates changes from actions', () => {
    const changes = getChanges(ACTIONS);
    expect(changes).toEqual(CHANGES);
  });
});
