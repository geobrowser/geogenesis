import { describe, expect, it } from 'vitest';
import { MockNetwork } from '../services/network';
import { FactsStore } from './facts';


describe('FactsStore', () => {
  it('Initializes to empty', () => {
    const store = new FactsStore({ api: new MockNetwork() });
    expect(store.facts).toStrictEqual([]);
  });

  it('Adds new fact', () => {
    const store = new FactsStore({ api: new MockNetwork() });

    store.createFact({
      id: '1',
      entityId: '1',
      attribute: 'name',
      value: 'John Doe',
    });

    expect(store.facts).toStrictEqual([
      {
        id: '1',
        entityId: '1',
        attribute: 'name',
        value: 'John Doe',
      },
    ]);
  });
});
