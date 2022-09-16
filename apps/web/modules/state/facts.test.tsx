import { describe, expect, it } from 'vitest';
import { MockNetwork } from '../services/network';
import { FactsStore } from './facts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

  it("Syncs 'remote' facts with local facts", async () => {
    const store = new FactsStore({ api: new MockNetwork(500) });

    // Janky as hell but works.
    // TODO: Wait for syncer$ to emit a value instead of sleeping.
    await sleep(1000);

    expect(store.facts).toStrictEqual([
      {
        id: '293487',
        entityId: '234897',
        attribute: 'name',
        value: 'Van Horn',
      },
    ]);
  });
});
