import { describe, expect, it } from 'vitest';

import { ActionsStore } from '~/core/state/actions-store';
import { CreateTripleAction, StringValue, Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { options } from '../environment/environment';
import { Storage } from '../io';
import { MockNetwork, makeStubTriple } from '../io/mocks/mock-network';
import { LocalStore } from '../state/local-store';
import { Merged as MergeDataSource } from './merged';

const storageClient = new Storage.StorageClient(options.development.ipfs);

describe('MergeDataSource merges local triples with network triples', () => {
  // Right now we don't filter locally created triples in fetchTriples. This means that we may return extra
  // triples that do not match the passed in query + filter.
  it('merges local and network triples', async () => {
    const stubTriple = makeStubTriple('Alice');

    const store = new ActionsStore({ storageClient });
    const localStore = new LocalStore({ store: store });

    const changedLocalTriple: Triple = {
      ...stubTriple,
      entityName: 'Bob',
      value: { ...stubTriple.value, value: 'Bob' } as StringValue,
    };
    store.update(changedLocalTriple, stubTriple);

    const mergedNetwork = new MergeDataSource({
      subgraph: new MockNetwork({ triples: [stubTriple] }),
      store,
      localStore,
    });

    const triples = await mergedNetwork.fetchTriples({
      endpoint: options.development.subgraph,
      space: stubTriple.space,
      query: '',
      first: 10,
      skip: 0,
      filter: [],
    });

    const changedLocalTripleAsAction: CreateTripleAction = {
      type: 'createTriple',
      ...changedLocalTriple,
    };

    expect(triples).toEqual([changedLocalTripleAsAction]);
  });

  it('merges local triples with filters', async () => {
    const stubTriple = makeStubTriple('Alice', 'alice-id');

    const store = new ActionsStore({ storageClient });
    const localStore = new LocalStore({ store: store });

    store.create(stubTriple);

    const mergedNetwork = new MergeDataSource({
      subgraph: new MockNetwork(),
      store,
      localStore,
    });

    const tripleForAlice = await mergedNetwork.fetchTriples({
      query: '',
      endpoint: options.development.subgraph,
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
      endpoint: options.development.subgraph,
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
    const store = new ActionsStore({ storageClient });
    const localStore = new LocalStore({ store: store });

    store.remove(stubTriple);

    const changedLocalTriple: Triple = {
      ...stubTriple,
      entityName: 'Bob',
      value: { ...stubTriple.value, value: 'Bob' } as StringValue,
    };
    store.update(changedLocalTriple, stubTriple);

    const mergedNetwork = new MergeDataSource({
      subgraph,
      store,
      localStore,
    });
    const entities = await mergedNetwork.fetchEntities({
      endpoint: options.development.subgraph,
      query: '',
      filter: [],
    });

    const changedLocalTripleAsAction: CreateTripleAction = {
      type: 'createTriple',
      ...changedLocalTriple,
    };

    expect(entities).toEqual(Entity.entitiesFromTriples([changedLocalTripleAsAction]));
  });

  it('with a query', async () => {
    const stubTriple = makeStubTriple('Alice');

    const subgraph = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ storageClient });
    const localStore = new LocalStore({ store: store });

    const changedLocalTriple: Triple = {
      ...stubTriple,
      entityName: 'Bob',
      value: { ...stubTriple.value, value: 'Bob' } as StringValue,
    };

    store.update(changedLocalTriple, stubTriple);

    const mergedNetwork = new MergeDataSource({ subgraph, store, localStore });
    const entities = await mergedNetwork.fetchEntities({
      endpoint: options.development.subgraph,
      query: 'Bob',
      filter: [],
    });

    const changedLocalTripleAsAction: CreateTripleAction = {
      type: 'createTriple',
      ...changedLocalTriple,
    };

    expect(entities).toEqual(Entity.entitiesFromTriples([changedLocalTripleAsAction]));
  });
});

describe('MergeDataSource merges local entity with network entity', () => {
  // This should take the local version of the entity
  it('local entity and network entity both exist', async () => {
    const stubTriple = makeStubTriple('Alice');

    const subgraph = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ storageClient });
    const localStore = new LocalStore({ store: store });

    const changedLocalTriple: Triple = {
      ...stubTriple,
      entityName: 'Bob',
      value: { ...stubTriple.value, value: 'Bob' } as StringValue,
    };

    store.update(changedLocalTriple, stubTriple);

    const mergedNetwork = new MergeDataSource({ subgraph, store, localStore });
    const entity = await mergedNetwork.fetchEntity({ id: stubTriple.id, endpoint: options.development.subgraph });

    const changedLocalTripleAsAction: CreateTripleAction = {
      type: 'createTriple',
      ...changedLocalTriple,
    };

    expect(entity).toEqual(Entity.entitiesFromTriples([changedLocalTripleAsAction])[0]);
  });

  // This should take the local entity
  it('local entity exists and network entity does not exist', async () => {
    const stubTriple = makeStubTriple('Devin');

    const subgraph = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ storageClient });
    const localStore = new LocalStore({ store: store });

    const changedLocalTriple = makeStubTriple('Bob');
    store.create(changedLocalTriple);

    const mergedNetwork = new MergeDataSource({ subgraph, store, localStore });
    const entity = await mergedNetwork.fetchEntity({
      id: changedLocalTriple.id,
      endpoint: options.development.subgraph,
    });

    const changedLocalTripleAsAction: CreateTripleAction = {
      type: 'createTriple',
      ...changedLocalTriple,
    };

    expect(entity).toEqual(Entity.entitiesFromTriples([changedLocalTripleAsAction])[0]);
  });

  // This should take the network entity
  it('local entity does not exist and network entity exists', async () => {
    const stubTriple = makeStubTriple('Devin');

    const subgraph = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ storageClient });
    const localStore = new LocalStore({ store: store });

    const mergedNetwork = new MergeDataSource({ subgraph, store, localStore });
    const entity = await mergedNetwork.fetchEntity({ id: stubTriple.id, endpoint: options.development.subgraph });

    expect(entity).toEqual(Entity.entitiesFromTriples([stubTriple])[0]);
  });

  // This should return null
  it('local entity does not exist and network does not exist', async () => {
    const stubTriple = makeStubTriple('Devin');

    const subgraph = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ storageClient });
    const localStore = new LocalStore({ store: store });

    const mergedNetwork = new MergeDataSource({ subgraph, store, localStore });
    const entity = await mergedNetwork.fetchEntity({ id: 'Banana', endpoint: options.development.subgraph });

    expect(entity).toEqual(null);
  });
});
