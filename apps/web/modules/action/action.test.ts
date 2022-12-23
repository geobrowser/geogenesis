import { describe, expect } from 'vitest';
import { makeStubTriple } from '~/modules/services/mock-network';
import { Action as ActionType, EditTripleAction } from '~/modules/types';
import { getChangeCount, squashChanges } from './action';

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

// edit-delete
describe('Action squashing', () => {
  it('Squashes create-edit', () => {
    const actions: ActionType[] = [
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
          value: { type: 'string', id: 'string:2', value: 'Devin-2' },
        },
      },
    ];

    const squashed = squashChanges(actions);
    expect(squashed).toEqual([(actions[1] as EditTripleAction).after]);
  });

  it('Squashes create-delete', () => {
    const actions: ActionType[] = [
      {
        type: 'createTriple',
        ...makeStubTriple('Devin'),
      },
      {
        type: 'deleteTriple',
        ...makeStubTriple('Devin'),
        value: { type: 'string', id: 'string:2', value: 'Devin-2' },
      },
    ];

    const squashed = squashChanges(actions);
    expect(squashed).toEqual([]);
  });

  it('Squashes create-edit-delete', () => {
    const actions: ActionType[] = [
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
          value: { type: 'string', id: 'string:2', value: 'Devin-2' },
        },
      },
      {
        type: 'deleteTriple',
        ...makeStubTriple('Devin'),
        value: { type: 'string', id: 'string:2', value: 'Devin-2' },
      },
    ];

    const squashed = squashChanges(actions);
    expect(squashed).toEqual([]);
  });

  it('Squashes edit-edit', () => {
    const squashed = squashChanges(multipleEditsToSameTriple);
    expect(squashed).toEqual([multipleEditsToSameTriple[1]]);
  });

  it('Squashes edit-delete', () => {
    const actions: ActionType[] = [
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
        ...makeStubTriple('Alice'),
      },
    ];

    const squashed = squashChanges(actions);
    expect(squashed).toEqual([actions[1]]);
  });

  it('Squashes edit-edit-delete', () => {
    const actions: ActionType[] = [
      ...multipleEditsToSameTriple,
      {
        type: 'deleteTriple',
        ...makeStubTriple('Alice'),
      },
    ];

    const squashed = squashChanges(actions);
    expect(squashed).toEqual([actions[2]]);
  });
});
