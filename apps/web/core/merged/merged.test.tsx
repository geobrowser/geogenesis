import { describe, expect, it } from 'vitest';

import { Action, CreateTripleAction, EditTripleAction, StringValue, Triple } from '~/core/types';

import { options } from '../environment/environment';
import { useActionsStore } from '../hooks/use-actions-store';
import { ID } from '../id';
import { MockNetwork, makeStubTriple } from '../io/mocks/mock-network';
import { useLocalStore } from '../state/local-store';
import { Entity } from '../utils/entity';
import { Merged as MergeDataSource } from './merged';

const createMockActionsStore = (actions?: Action[]): ReturnType<typeof useActionsStore> => {
  return {
    allActions: actions || [],
    actions: {},
    update: () => {},
    create: () => {},
    remove: () => {},
    clear: () => {},
    actionsByEntityId: {},
    actionsFromSpace: [],
    addActions: () => {},
    deleteActionsFromSpace: () => {},
    addActionsToSpaces: () => {},
    restore: () => {},
    allSpacesWithActions: [],
  };
};

const createMockLocalStore = (triples?: Triple[]): ReturnType<typeof useLocalStore> => {
  return {
    entities: [],
    triples: triples || [],
  };
};

describe('MergeDataSource merges local triples with network triples', () => {
  // Right now we don't filter locally created triples in fetchTriples. This means that we may return extra
  // triples that do not match the passed in query + filter.
  it('merges local and network triples', async () => {
    const stubTriple = makeStubTriple('Alice');

    const changedLocalTriple: CreateTripleAction = {
      ...stubTriple,
      type: 'createTriple',
      entityName: 'Bob',
      value: { ...stubTriple.value, value: 'Bob' } as StringValue,
    };

    const newAction: EditTripleAction = {
      id: ID.createEntityId(),
      type: 'editTriple',
      before: {
        type: 'deleteTriple',
        ...stubTriple,
      },
      after: changedLocalTriple,
    };

    const mergedNetwork = new MergeDataSource({
      subgraph: new MockNetwork({ triples: [stubTriple] }),
      store: {
        ...createMockActionsStore(),
        actions: {
          [stubTriple.space]: [newAction],
        },
        allActions: [newAction],
        actionsFromSpace: [newAction],
      },
      localStore: createMockLocalStore(),
    });

    const triples = await mergedNetwork.fetchTriples({
      space: stubTriple.space,
      query: '',
      first: 10,
      skip: 0,
      filter: [],
    });

    expect(triples).toEqual([changedLocalTriple]);
  });

  it('merges local triples with filters', async () => {
    const stubTriple = makeStubTriple('Alice', 'alice-id');

    const newAction: CreateTripleAction = {
      ...stubTriple,
      type: 'createTriple',
    };

    const mergedNetwork = new MergeDataSource({
      subgraph: new MockNetwork(),
      store: {
        ...createMockActionsStore(),
        allActions: [newAction],
        actionsFromSpace: [newAction],
        actions: {
          [stubTriple.space]: [newAction],
        },
      },
      localStore: createMockLocalStore(),
    });

    const tripleForAlice = await mergedNetwork.fetchTriples({
      query: '',
      first: 1,
      skip: 0,
      filter: [
        {
          field: 'entity-id',
          value: 'alice-id',
        },
      ],
    });

    expect(tripleForAlice).toEqual([{ ...stubTriple, type: 'createTriple' }]);

    const triplesForBob = await mergedNetwork.fetchTriples({
      query: '',
      first: 1,
      skip: 0,
      filter: [
        {
          field: 'entity-id',
          value: 'bob-id',
        },
      ],
    });

    expect(triplesForBob).not.toEqual([{ ...stubTriple, type: 'createTriple' }]);
  });
});

describe('MergeDataSource merges local entities with network entities', () => {
  it('without a query', async () => {
    const stubTriple = makeStubTriple('Alice');

    const subgraph = new MockNetwork({ triples: [stubTriple] });

    const changedLocalTriple: EditTripleAction = {
      id: '123',
      type: 'editTriple',
      before: {
        ...stubTriple,
        type: 'deleteTriple',
      },
      after: {
        ...stubTriple,
        type: 'createTriple',
        entityName: 'Bob',
        value: { ...stubTriple.value, value: 'Bob' } as StringValue,
      },
    };

    const mergedNetwork = new MergeDataSource({
      subgraph,
      store: {
        ...createMockActionsStore(),
        allActions: [changedLocalTriple],
        actionsFromSpace: [changedLocalTriple],
        actions: {
          [stubTriple.space]: [changedLocalTriple],
        },
      },
      localStore: createMockLocalStore(),
    });

    const entities = await mergedNetwork.fetchEntities({
      endpoint: options.development.subgraph,
      query: '',
      filter: [],
    });

    expect(entities).toEqual(Entity.entitiesFromTriples([changedLocalTriple.after]));
  });

  it('with a query', async () => {
    const stubTriple = makeStubTriple('Alice');

    const subgraph = new MockNetwork({ triples: [stubTriple] });

    const changedLocalTriple: EditTripleAction = {
      id: '123',
      type: 'editTriple',
      before: {
        ...stubTriple,
        type: 'deleteTriple',
      },
      after: {
        ...stubTriple,
        type: 'createTriple',
        entityName: 'Bob',
        value: { ...stubTriple.value, value: 'Bob' } as StringValue,
      },
    };

    const mergedNetwork = new MergeDataSource({
      subgraph,
      store: {
        ...createMockActionsStore(),
        allActions: [changedLocalTriple],
        actionsFromSpace: [changedLocalTriple],
        actions: {
          [stubTriple.space]: [changedLocalTriple],
        },
      },
      localStore: createMockLocalStore(),
    });

    const entities = await mergedNetwork.fetchEntities({
      endpoint: options.development.subgraph,
      query: 'Bob',
      filter: [],
    });

    expect(entities).toEqual(Entity.entitiesFromTriples([changedLocalTriple.after]));
  });
});

describe('MergeDataSource merges local entity with network entity', () => {
  // This should take the local version of the entity
  it('local entity and network entity both exist', async () => {
    const stubTriple = makeStubTriple('Alice');

    const subgraph = new MockNetwork({ triples: [stubTriple] });

    const changedLocalTriple: EditTripleAction = {
      id: '123',
      type: 'editTriple',
      before: {
        ...stubTriple,
        type: 'deleteTriple',
      },
      after: {
        ...stubTriple,
        type: 'createTriple',
        entityName: 'Bob',
        value: { ...stubTriple.value, value: 'Bob' } as StringValue,
      },
    };

    const mergedNetwork = new MergeDataSource({
      subgraph,
      store: {
        ...createMockActionsStore(),
        allActions: [changedLocalTriple],
        actionsFromSpace: [changedLocalTriple],
        actions: {
          [stubTriple.space]: [changedLocalTriple],
        },
      },
      localStore: createMockLocalStore(),
    });

    const entity = await mergedNetwork.fetchEntity({ id: stubTriple.id });

    expect(entity).toEqual(Entity.entitiesFromTriples([changedLocalTriple.after])[0]);
  });

  // This should take the local entity
  it('local entity exists and network entity does not exist', async () => {
    const stubTriple = makeStubTriple('Devin');

    const subgraph = new MockNetwork({ triples: [stubTriple] });

    const changedLocalTriple: CreateTripleAction = {
      ...makeStubTriple('Bob'),
      type: 'createTriple',
    };

    const mergedNetwork = new MergeDataSource({
      subgraph,
      store: {
        ...createMockActionsStore(),
        allActions: [changedLocalTriple],
        actionsFromSpace: [changedLocalTriple],
        actions: {
          [stubTriple.space]: [changedLocalTriple],
        },
      },
      localStore: createMockLocalStore([changedLocalTriple]),
    });

    const entity = await mergedNetwork.fetchEntity({
      id: changedLocalTriple.id,
    });

    expect(entity).toEqual(Entity.entitiesFromTriples([changedLocalTriple])[0]);
  });

  // // This should take the network entity
  it('local entity does not exist and network entity exists', async () => {
    const stubTriple = makeStubTriple('Devin');

    const subgraph = new MockNetwork({ triples: [stubTriple] });

    const mergedNetwork = new MergeDataSource({
      subgraph,
      store: createMockActionsStore(),
      localStore: createMockLocalStore(),
    });

    const entity = await mergedNetwork.fetchEntity({ id: stubTriple.id });

    expect(entity).toEqual(Entity.entitiesFromTriples([stubTriple])[0]);
  });

  // This should return null
  it('local entity does not exist and network does not exist', async () => {
    const stubTriple = makeStubTriple('Devin');

    // Adding another triple to ensure we don't have a false positive when the
    // network doesn't have any triples.
    const subgraph = new MockNetwork({ triples: [stubTriple] });

    const mergedNetwork = new MergeDataSource({
      subgraph,
      store: createMockActionsStore(),
      localStore: createMockLocalStore(),
    });

    const entity = await mergedNetwork.fetchEntity({ id: 'Banana' });

    expect(entity).toEqual(null);
  });
});
