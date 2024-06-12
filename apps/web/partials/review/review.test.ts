import { describe, expect, it } from 'vitest';

import { MockNetworkData } from '~/core/io';
import { Triple } from '~/core/types';
import { Change } from '~/core/utils/change';
import type { Changeset } from '~/core/utils/change/change';

const TEXT_ACTIONS: Array<Triple> = [
  MockNetworkData.makeStubTriple('Devin'),
  {
    ...MockNetworkData.makeStubTriple('Alice'),
    value: { type: 'TEXT', value: 'Alice-2' },
  },
  MockNetworkData.makeStubTriple('Bob'),
];

const TEXT_CHANGES: Record<string, Changeset> = {
  Devin: {
    name: '',
    attributes: {
      name: {
        type: 'TEXT',
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
        type: 'TEXT',
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
        type: 'TEXT',
        name: 'Name',
        before: 'Bob',
        after: null,
        actions: ['Bob'],
      },
    },
    actions: ['Bob'],
  },
};

const ENTITY_ACTIONS: Array<Triple> = [
  MockNetworkData.makeStubRelationAttribute('Devin'),
  MockNetworkData.makeStubRelationAttribute('Bob'),
];

const ENTITY_CHANGES: Record<string, Changeset> = {
  Devin: {
    name: '',
    attributes: {
      attribute: {
        type: 'ENTITY',
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
        type: 'ENTITY',
        name: 'Types',
        before: ['Text'],
        after: [],
        actions: ['Bob'],
      },
    },
    actions: ['Bob'],
  },
};

describe('Triples to changes transformer (TEXT values)', () => {
  it('Generates changes from Triples', async () => {
    const network = new MockNetworkData.MockNetwork();
    const { changes } = await Change.fromTriples(TEXT_ACTIONS, network);
    expect(changes).toEqual(TEXT_CHANGES);
  });
});

describe('Triples to changes transformer (ENTITY values)', () => {
  it('Generates changes from Triples', async () => {
    const network = new MockNetworkData.MockNetwork();
    const { changes } = await Change.fromTriples(ENTITY_ACTIONS, network);
    expect(changes).toEqual(ENTITY_CHANGES);
  });
});
