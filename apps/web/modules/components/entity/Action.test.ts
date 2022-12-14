import { describe, expect } from 'vitest';
import { makeStubTriple } from '~/modules/services/mock-network';
import { Action as ActionType } from '~/modules/types';
import { Action } from './Action';

// Count should be 3
const actions: ActionType[] = [
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

describe('Action', () => {
  it('Generates correct change counts from actions', () => {
    const changes = Action.getChangeCount(actions);
    expect(changes).toEqual(3);
  });
});
