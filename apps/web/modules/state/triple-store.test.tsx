import { when } from '@legendapp/state';
import { describe, expect, it } from 'vitest';
import { Triple } from '../models/Triple';
import { makeStubTriple, MockNetwork } from '../services/mock-network';
import { OmitStrict, Triple as TripleType } from '../types';
import { TripleStore } from './triple-store';

const testBob: OmitStrict<TripleType, 'id'> = {
  space: 's',
  entityId: 'bob',
  entityName: 'Bob',
  attributeId: 'name',
  attributeName: 'Bob',
  value: {
    type: 'string',
    id: 's~bob',
    value: 'Bob',
  },
};

describe('TripleStore', () => {
  it('Initializes to empty', async () => {
    const store = new TripleStore({ api: new MockNetwork(), space: 's', initialTriples: [] });
    expect(store.triples$.get()).toStrictEqual([]);
  });

  it('Adds new triple', async () => {
    const store = new TripleStore({ api: new MockNetwork(), space: 's', initialTriples: [] });

    const newTriple: TripleType = Triple.withId(testBob);

    store.create([newTriple]);
    expect(store.triples$.get()).toStrictEqual([newTriple]);
  });

  it('Tracks the created triple', async () => {
    const store = new TripleStore({ api: new MockNetwork(), space: 's', initialTriples: [] });

    const newTriple: TripleType = Triple.withId(testBob);

    store.create([newTriple]);
    expect(store.actions$.get()).toStrictEqual([
      {
        ...newTriple,
        type: 'createTriple',
      },
    ]);
  });

  it('Computes triples from page size', async () => {
    const initialTriples = [makeStubTriple('Alice')];

    const store = new TripleStore({
      api: new MockNetwork({ triples: initialTriples }),
      pageSize: 1,
      space: 's',
      initialTriples: [],
    });

    await when(() => store.triples$.get().length > 0);

    expect(store.triples$.get()).toStrictEqual([makeStubTriple('Alice')]);
  });
});
