import { when } from '@legendapp/state';
import { describe, expect, it } from 'vitest';

import { options } from '~/core/environment/environment';
import { MockNetworkData, Storage } from '~/core/io';

import { ActionsStore } from '../actions-store/actions-store';
import { TripleStore } from './triple-store';

const storageClient = new Storage.StorageClient(options.development.ipfs);

describe('TripleStore', () => {
  it('Initializes to empty', async () => {
    const subgraph = new MockNetworkData.MockNetwork();
    const store = new TripleStore({
      subgraph,
      config: options.development,
      space: 's',
      ActionsStore: new ActionsStore({ storageClient }),
    });
    expect(store.triples$.get()).toStrictEqual([]);
  });

  it('Computes triples from page size', async () => {
    const initialTriples = [MockNetworkData.makeStubTriple('Alice')];
    const subgraph = new MockNetworkData.MockNetwork({ triples: initialTriples });

    const store = new TripleStore({
      subgraph,
      config: options.development,
      pageSize: 1,
      space: 's',
      ActionsStore: new ActionsStore({ storageClient }),
    });

    await when(() => store.triples$.get().length > 0);

    expect(store.triples$.get()).toStrictEqual([MockNetworkData.makeStubTriple('Alice')]);
  });
});
