import { describe, expect } from 'vitest';

import { makeStubTriple } from '~/modules/io/data-source/mock-network';
import { Action as ActionType } from '~/modules/types';
import { getChangeCount, unpublishedChanges } from './action';

// Count should be 3
const basicActions: ActionType[] = [
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

const multipleEditsToSameTriple: ActionType[] = [
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
    type: 'editTriple',
    before: {
      type: 'deleteTriple',
      ...makeStubTriple('Alice'),
      value: { type: 'string', id: 'string:2', value: 'Alice-2' },
    },
    after: {
      type: 'createTriple',
      ...makeStubTriple('Alice'),
      value: { type: 'string', id: 'string:3', value: 'Alice-3' },
    },
  },
];

const createEditDeleteSameTriple: ActionType[] = [
  {
    type: 'createTriple',
    ...makeStubTriple('Devin'),
  },
  {
    type: 'editTriple',
    before: {
      type: 'deleteTriple',
      ...makeStubTriple('Devin'),
    },
    after: {
      type: 'createTriple',
      ...makeStubTriple('Devin'),
      value: { type: 'string', id: 'string:2', value: 'Alice-2' },
    },
  },
  {
    type: 'deleteTriple',
    ...makeStubTriple('Devin'),
  },
];

describe('Action counts', () => {
  it('Generates correct change counts from base create/edit/delete actions', () => {
    const changes = getChangeCount(basicActions);
    expect(changes).toEqual(3);
  });

  it('Generates correct change counts for multiple edits on the same triple', () => {
    const changes = getChangeCount(multipleEditsToSameTriple);
    expect(changes).toEqual(1);
  });

  it('Generates correct change counts for creating, editing, then deleting the same triple', () => {
    const changes = getChangeCount(createEditDeleteSameTriple);
    expect(changes).toEqual(0);
  });
});

const publishedAndUnpublishedActions: ActionType[] = [
  {
    type: 'createTriple',
    ...makeStubTriple('Alice'),
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
    hasBeenPublished: true,
  },
];

describe('Published actions', () => {
  it('Returns actions that have not been published', () => {
    expect(unpublishedChanges(publishedAndUnpublishedActions)).toEqual([publishedAndUnpublishedActions[0]]);
  });
});
