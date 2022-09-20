import { describe, expect, it } from 'vitest';
import { MockNetwork } from '../services/mock-network';
import { IFact } from '../types';
import { FactsStore } from './facts';

describe('FactsStore', () => {
  it('Initializes to empty', () => {
    const store = new FactsStore({ api: new MockNetwork() });
    expect(store.facts).toStrictEqual([]);
  });

  it('Adds new fact', () => {
    const store = new FactsStore({ api: new MockNetwork() });

    const newFact: IFact = {
      id: '1',
      entity: {
        id: '1',
      },
      attribute: {
        id: 'name',
      },
      stringValue: 'Bob',
    };

    store.createFact(newFact);
    expect(store.facts).toStrictEqual([newFact]);
  });
});
