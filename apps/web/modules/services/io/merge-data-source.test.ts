import { describe } from 'vitest';
import { ActionsStore } from '~/modules/action';
import { Entity } from '~/modules/entity';
import { CreateTripleAction, StringValue, Triple } from '~/modules/types';
import { MockNetwork, makeStubTriple } from '../mock-network';
import { MergeDataSource } from './merge-data-source';

describe('MergeDataSource merges local triples with network triples', () => {
  // Right now we don't filter locally created triples in fetchTriples. This means that we may return extra
  // triples that do not match the passed in query + filter.
  it('merges local and network triples', async () => {
    const stubTriple = makeStubTriple('Alice');

    const api = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ api: api });

    const changedLocalTriple: Triple = {
      ...stubTriple,
      entityName: 'Bob',
      value: { ...stubTriple.value, value: 'Bob' } as StringValue,
    };
    store.update(changedLocalTriple, stubTriple);

    const mergedNetwork = new MergeDataSource({ api, store });
    const triples = await mergedNetwork.fetchTriples({
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

    expect(triples.triples).toEqual([changedLocalTripleAsAction]);
  });
});

describe('MergeDataSource merges local entities with network entities', () => {
  it('without a query', async () => {
    const stubTriple = makeStubTriple('Alice');

    const api = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ api: api });
    store.remove(stubTriple);

    const changedLocalTriple: Triple = {
      ...stubTriple,
      entityName: 'Bob',
      value: { ...stubTriple.value, value: 'Bob' } as StringValue,
    };
    store.update(changedLocalTriple, stubTriple);

    const mergedNetwork = new MergeDataSource({ api, store });
    const entities = await mergedNetwork.fetchEntities({
      space: stubTriple.space,
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

    const api = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ api: api });

    const changedLocalTriple: Triple = {
      ...stubTriple,
      entityName: 'Bob',
      value: { ...stubTriple.value, value: 'Bob' } as StringValue,
    };

    store.update(changedLocalTriple, stubTriple);

    const mergedNetwork = new MergeDataSource({ api, store });
    const entities = await mergedNetwork.fetchEntities({
      space: stubTriple.space,
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

    const api = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ api: api });

    const changedLocalTriple: Triple = {
      ...stubTriple,
      entityName: 'Bob',
      value: { ...stubTriple.value, value: 'Bob' } as StringValue,
    };

    store.update(changedLocalTriple, stubTriple);

    const mergedNetwork = new MergeDataSource({ api, store });
    const entity = await mergedNetwork.fetchEntity(stubTriple.id);

    const changedLocalTripleAsAction: CreateTripleAction = {
      type: 'createTriple',
      ...changedLocalTriple,
    };

    expect(entity).toEqual(Entity.entitiesFromTriples([changedLocalTripleAsAction])[0]);
  });

  // This should take the local entity
  it('local entity exists and network entity does not exist', async () => {
    const stubTriple = makeStubTriple('Devin');

    const api = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ api: api });

    const changedLocalTriple: Triple = makeStubTriple('Bob');
    store.create(changedLocalTriple);

    const mergedNetwork = new MergeDataSource({ api, store });
    const entity = await mergedNetwork.fetchEntity(changedLocalTriple.id);

    const changedLocalTripleAsAction: CreateTripleAction = {
      type: 'createTriple',
      ...changedLocalTriple,
    };

    expect(entity).toEqual(Entity.entitiesFromTriples([changedLocalTripleAsAction])[0]);
  });

  it('local entity does not exist and network entity exists', async () => {
    const stubTriple = makeStubTriple('Devin');

    const api = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ api: api });

    const mergedNetwork = new MergeDataSource({ api, store });
    const entity = await mergedNetwork.fetchEntity(stubTriple.id);

    expect(entity).toEqual(Entity.entitiesFromTriples([stubTriple])[0]);
  });

  it('local entity does not exist and network does not exist', async () => {
    const stubTriple = makeStubTriple('Devin');

    const api = new MockNetwork({ triples: [stubTriple] });
    const store = new ActionsStore({ api: api });

    const mergedNetwork = new MergeDataSource({ api, store });
    const entity = await mergedNetwork.fetchEntity('Banana');

    expect(entity).toEqual(null);
  });
});
