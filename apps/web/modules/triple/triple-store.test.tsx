import { when } from '@legendapp/state';
import { describe, expect, it } from 'vitest';
import { ActionsStore } from '../action';
import { makeStubTriple, MockNetwork } from '../services/mock-network';
import { TripleStore } from './triple-store';

describe('TripleStore', () => {
  it('Initializes to empty', async () => {
    const network = new MockNetwork();
    const store = new TripleStore({
      api: network,
      space: 's',
      initialTriples: [],
      ActionsStore: new ActionsStore({ api: network }),
    });
    expect(store.triples$.get()).toStrictEqual([]);
  });

  it('Computes triples from page size', async () => {
    const initialTriples = [makeStubTriple('Alice')];
    const network = new MockNetwork({ triples: initialTriples });

    const store = new TripleStore({
      api: network,
      pageSize: 1,
      space: 's',
      initialTriples: [],
      ActionsStore: new ActionsStore({ api: network }),
    });

    await when(() => store.triples$.get().length > 0);

    expect(store.triples$.get()).toStrictEqual([makeStubTriple('Alice')]);
  });
});
