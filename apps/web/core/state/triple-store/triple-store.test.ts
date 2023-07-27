import { when } from '@legendapp/state';
import { describe, expect, it } from 'vitest';

import { TripleStore } from './triple-store';
import { MockNetworkData } from '~/core/io';
import { ActionsStore } from '../actions-store';

describe('TripleStore', () => {
  it('Initializes to empty', async () => {
    const network = new MockNetworkData.MockNetwork();
    const store = new TripleStore({
      api: network,
      space: 's',
      ActionsStore: new ActionsStore({ api: network }),
    });
    expect(store.triples$.get()).toStrictEqual([]);
  });

  it('Computes triples from page size', async () => {
    const initialTriples = [MockNetworkData.makeStubTriple('Alice')];
    const network = new MockNetworkData.MockNetwork({ triples: initialTriples });

    const store = new TripleStore({
      api: network,
      pageSize: 1,
      space: 's',
      ActionsStore: new ActionsStore({ api: network }),
    });

    await when(() => store.triples$.get().length > 0);

    expect(store.triples$.get()).toStrictEqual([MockNetworkData.makeStubTriple('Alice')]);
  });
});
