import { describe, expect, it } from 'vitest';

import { MockNetworkData } from '~/core/io';
import { Change } from '~/core/utils/change';
import type { Action } from '~/core/types';
import type { Changeset } from '~/core/utils/change/change';

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

const STRING_CHANGES: Record<string, Changeset> = {
  Devin: {
    name: '',
    attributes: {
      name: {
        type: 'string',
        name: 'Name',
        before: null,
        after: 'Devin',
        actions: ['Devin'],
      },
    },
    actions: ['Devin'],
  },
  Alice: {
    name: '',
    attributes: {
      name: {
        type: 'string',
        name: 'Name',
        before: 'Alice',
        after: 'Alice-2',
        actions: ['Alice'],
      },
    },
    actions: ['Alice'],
  },
  Bob: {
    name: '',
    attributes: {
      name: {
        type: 'string',
        name: 'Name',
        before: 'Bob',
        after: null,
        actions: ['Bob'],
      },
    },
    actions: ['Bob'],
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

const ENTITY_CHANGES: Record<string, Changeset> = {
  Devin: {
    name: '',
    attributes: {
      attribute: {
        type: 'entity',
        name: 'Types',
        before: [],
        after: ['Text'],
        actions: ['Devin'],
      },
    },
    actions: ['Devin'],
  },
  Bob: {
    name: '',
    attributes: {
      attribute: {
        type: 'entity',
        name: 'Types',
        before: ['Text'],
        after: [],
        actions: ['Bob'],
      },
    },
    actions: ['Bob'],
  },
};

describe('Actions to changes transformer (string values)', () => {
  it('Generates changes from actions', async () => {
    const network = new MockNetworkData.MockNetwork();
    const { changes } = await Change.fromActions(STRING_ACTIONS, network);
    expect(changes).toEqual(STRING_CHANGES);
  });
});

describe('Actions to changes transformer (entity values)', () => {
  it('Generates changes from actions', async () => {
    const network = new MockNetworkData.MockNetwork();
    const { changes } = await Change.fromActions(ENTITY_ACTIONS, network);
    expect(changes).toEqual(ENTITY_CHANGES);
  });
});
