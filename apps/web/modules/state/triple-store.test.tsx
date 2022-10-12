import { Signer } from 'ethers';
import { describe, expect, it } from 'vitest';
import { createTripleId, createTripleWithId } from '../services/create-id';
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

    const newTriple: Triple = createTripleWithId('bob', 'name', {
      type: 'string',
      value: 'Bob',
    });

    store.create([newTriple]);
    expect(store.triples).toStrictEqual([
      {
        ...newTriple,
        status: 'created',
      },
    ]);
  });

  it('Updates existing triple', () => {
    const originalTriple: Triple = createTripleWithId('alice', 'name', { type: 'string', value: 'Alice' });

    const store = new TripleStore({
      api: new StubNetwork(),
      initialtriples: [originalTriple],
    });

    const newTriple: Triple = createTripleWithId(originalTriple.entityId, originalTriple.attributeId, {
      type: 'string',
      value: 'Bob',
    });

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

    const newTriple: Triple = createTripleWithId('bob', 'name', {
      type: 'string',
      value: 'Bob',
    });

    store.create([newTriple]);
    expect(store.changedTriples$.value).toStrictEqual([
      {
        ...newTriple,
        status: 'created',
      },
    ]);
  });

  it('Tracks an updated triple', () => {
    const originalTriple: Triple = createTripleWithId('alice', 'name', {
      type: 'string',
      value: 'Alice',
    });

    const store = new TripleStore({ api: new StubNetwork(), initialtriples: [originalTriple] });

    const newTriple: Triple = createTripleWithId('bob', 'name', {
      type: 'string',
      value: 'Bob',
    });

    store.update(newTriple, originalTriple);

    expect(store.changedTriples$.value).toStrictEqual([
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
    const originalTriple: Triple = createTripleWithId('alice', 'name', {
      type: 'string',
      value: 'Alice',
    });

    const store = new TripleStore({ api: new StubNetwork(), initialtriples: [originalTriple] });

    const firstTriple: Triple = createTripleWithId('alice', 'name', { type: 'string', value: 'Bob' });

    store.update(firstTriple, originalTriple);

    const secondTriple: Triple = createTripleWithId(firstTriple.entityId, firstTriple.attributeId, {
      type: 'string',
      value: 'Connor',
    });

    store.update(secondTriple, firstTriple);

    expect(store.changedTriples$.value).toStrictEqual([
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

  it('Updates the tracked entity names when creating triple with name attribute', () => {
    const store = new TripleStore({ api: new StubNetwork() });

    const originalTriple: Triple = createTripleWithId('bob', 'name', { type: 'string', value: 'Bob' });

    store.create([originalTriple]);

    const secondTriple = createTripleWithId(originalTriple.entityId, originalTriple.attributeId, {
      type: 'string',
      value: 'Connor',
    });

    store.update(secondTriple, originalTriple);

    expect(store.entityNames$.value).toStrictEqual({
      bob: 'Connor',
    });
  });
});
