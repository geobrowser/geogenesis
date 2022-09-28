import { Signer } from 'ethers';
import { describe, expect, it } from 'vitest';
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

    const newFact: Triple = {
      id: '1',
      entityId: 'bob',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Bob',
      },
    };

    store.createTriple(newFact, {} as Signer);
    expect(store.triples).toStrictEqual([newFact]);
  });
});
