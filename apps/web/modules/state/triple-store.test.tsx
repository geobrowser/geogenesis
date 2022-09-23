import { Signer } from 'ethers';
import { describe, expect, it } from 'vitest';
import { MockNetwork } from '../services/mocks/mock-network';
import { Triple } from '../types';
import { TripleStore } from './triple-store';

describe('TripleStore', () => {
  it('Initializes to empty', () => {
    const store = new TripleStore({ api: new MockNetwork() });
    expect(store.triples).toStrictEqual([]);
  });

  it('Adds new triple', () => {
    const store = new TripleStore({ api: new MockNetwork() });

    const newFact: Triple = {
      id: '1',
      entity: {
        id: '1',
      },
      attribute: {
        id: 'name',
      },
      stringValue: 'Bob',
    };

    store.createTriple(newFact, {} as Signer);
    expect(store.triples).toStrictEqual([newFact]);
  });
});
