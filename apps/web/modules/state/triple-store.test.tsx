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

    store.create(newFact);
    expect(store.triples).toStrictEqual([newFact]);
  });

  it('Updates existing triple', () => {
    const store = new TripleStore({
      api: new StubNetwork(),
      initialtriples: [
        {
          id: '1',
          entityId: 'alice',
          attributeId: 'name',
          value: {
            type: 'string',
            value: 'Alice',
          },
        },
      ],
    });

    const newFact: Triple = {
      id: '1',
      entityId: 'bob',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Bob',
      },
    };

    store.update(newFact);
    expect(store.triples).toStrictEqual([newFact]);
  });
});
