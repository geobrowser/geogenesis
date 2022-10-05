import { Signer } from 'ethers';
import { describe, expect, it } from 'vitest';
import { createTripleId } from '../services/create-id';
import { StubNetwork } from '../services/stub-network';
import { Triple } from '../types';
import { TripleStore } from './triple-store';

describe('TripleStore', () => {
  it('Initializes to empty', () => {
    const store = new TripleStore({ api: new StubNetwork() });
    expect(store.triples).toStrictEqual([]);
  });

  it('Adds new triple', () => {
    const store = new TripleStore({ api: new StubNetwork() });

    const newTriple: Triple = {
      id: '1',
      entityId: 'bob',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Bob',
      },
    };

    store.create(newTriple);
    expect(store.triples).toStrictEqual([
      {
        ...newTriple,
        status: 'created',
      },
    ]);
  });

  it('Updates existing triple', () => {
    const originalTriple: Triple = {
      id: createTripleId('alice', 'name', {
        type: 'string',
        value: 'Alice',
      }),
      entityId: 'alice',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Alice',
      },
    };

    const store = new TripleStore({
      api: new StubNetwork(),
      initialtriples: [originalTriple],
    });

    const newTriple: Triple = {
      id: createTripleId('bob', 'name', {
        type: 'string',
        value: 'Bob',
      }),
      entityId: 'bob',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Bob',
      },
    };

    store.update(newTriple, originalTriple);

    expect(store.triples).toStrictEqual([
      {
        ...newTriple,
        status: 'edited',
      },
    ]);
  });

  it('Tracks the created triple', () => {
    const store = new TripleStore({ api: new StubNetwork() });

    const newTriple: Triple = {
      id: createTripleId('bob', 'name', { type: 'string', value: 'Bob' }),
      entityId: 'bob',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Bob',
      },
    };

    store.create(newTriple);
    expect(store.changedTriples).toStrictEqual([
      {
        ...newTriple,
        status: 'created',
      },
    ]);
  });

  it('Tracks an updated triple', () => {
    const originalTriple: Triple = {
      id: createTripleId('alice', 'name', {
        type: 'string',
        value: 'Alice',
      }),
      entityId: 'alice',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Alice',
      },
    };

    const store = new TripleStore({ api: new StubNetwork(), initialtriples: [originalTriple] });

    const newTriple: Triple = {
      id: '1',
      entityId: 'bob',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Bob',
      },
    };

    store.update(newTriple, originalTriple);

    expect(store.changedTriples).toStrictEqual([
      {
        ...originalTriple,
        status: 'deleted',
      },
      {
        ...newTriple,
        status: 'created',
      },
    ]);
  });

  it('Tracks a triple that was updated multiple times', () => {
    const originalTriple: Triple = {
      id: createTripleId('alice', 'name', {
        type: 'string',
        value: 'Alice',
      }),
      entityId: 'alice',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Alice',
      },
    };

    const store = new TripleStore({ api: new StubNetwork(), initialtriples: [originalTriple] });

    const firstTriple: Triple = {
      id: createTripleId('alice', 'name', { type: 'string', value: 'Bob' }),
      entityId: 'alice',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Bob',
      },
    };

    store.update(firstTriple, originalTriple);

    const secondTriple: Triple = {
      ...firstTriple,
      value: {
        type: 'string',
        value: 'Connor',
      },
    };

    store.update(secondTriple, firstTriple);

    expect(store.changedTriples).toStrictEqual([
      {
        ...originalTriple,
        status: 'deleted',
      },
      {
        ...secondTriple,
        status: 'created',
      },
    ]);
  });
});
