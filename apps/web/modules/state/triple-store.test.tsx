import { when } from '@legendapp/state';
import { describe, expect, it } from 'vitest';
import { createTripleWithId } from '../services/create-id';
import { MockNetwork, makeStubTriple } from '../services/mock-network';
import { Triple } from '../types';
import { TripleStore } from './triple-store';

describe('TripleStore', () => {
  it('Initializes to empty', async () => {
    const store = new TripleStore({ api: new MockNetwork() });
    expect(store.triples$.get()).toStrictEqual([]);
  });

  it('Adds new triple', async () => {
    const store = new TripleStore({ api: new MockNetwork() });

    const newTriple: Triple = createTripleWithId('', 'bob', 'name', {
      type: 'string',
      value: 'Bob',
    });

    store.create([newTriple]);
    expect(store.triples$.get()).toStrictEqual([newTriple]);
  });

  it('Updates existing triple', async () => {
    const store = new TripleStore({
      api: new MockNetwork(),
    });

    const originalTriple: Triple = createTripleWithId('', 'alice', 'name', { type: 'string', value: 'Alice' });
    store.create([originalTriple]);

    const newTriple: Triple = createTripleWithId('', originalTriple.entityId, originalTriple.attributeId, {
      type: 'string',
      value: 'Bob',
    });

    store.update(newTriple, originalTriple);
    expect(store.triples$.get()).toStrictEqual([newTriple]);
    expect(store.entityNames$.get()).toStrictEqual({ [newTriple.entityId]: 'Bob' });
  });

  it('Tracks the created triple', async () => {
    const store = new TripleStore({ api: new MockNetwork() });

    const newTriple: Triple = createTripleWithId('', 'bob', 'name', {
      type: 'string',
      value: 'Bob',
    });

    store.create([newTriple]);
    // expect(store.actions$)).toStrictEqual([]);
    expect(store.actions$.get()).toStrictEqual([
      {
        ...newTriple,
        type: 'createTriple',
      },
    ]);

    expect(store.entityNames$.get()).toStrictEqual({ [newTriple.entityId]: 'Bob' });
  });

  it('Computes triples from page size', async () => {
    const initialTriples = [makeStubTriple('Alice')];

    const store = new TripleStore({ api: new MockNetwork({ triples: initialTriples }), pageSize: 1 });

    await when(() => store.triples$.get().length > 0);
    await when(() => Object.keys(store.entityNames$.get()).length > 0);

    expect(store.triples$.get()).toStrictEqual([makeStubTriple('Alice')]);
    expect(store.entityNames$.get()).toEqual(expect.objectContaining({ Alice: 'Alice' }));
  });
});
