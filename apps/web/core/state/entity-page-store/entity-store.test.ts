import { describe, expect, it } from 'vitest';

import { options } from '~/core/environment/environment';
import { MockNetworkData, Subgraph } from '~/core/io';
import { StorageClient } from '~/core/io/storage/storage';

import { ActionsStore } from '../actions-store/actions-store';
import { EntityStore, createInitialDefaultTriples } from './entity-store';

describe('EntityStore', () => {
  it('Initializes to defaults', async () => {
    const storage = new StorageClient(options.production.ipfs);
    const actionsStore = new ActionsStore({ storageClient: storage });
    const store = new EntityStore({
      id: 'e',
      spaceId: 's',
      subgraph: Subgraph,
      config: options.production,
      initialTriples: [],
      initialSchemaTriples: [],
      ActionsStore: actionsStore,
      initialBlockIdsTriple: null,
      initialBlockTriples: [],
    });

    const defaultTriples = createInitialDefaultTriples('s', 'e');

    const triples = store.triples$.get();

    expect(triples).toHaveLength(0);
    expect(triples).toStrictEqual([]);
    expect(store.schemaTriples$.get()[0]).toStrictEqual(defaultTriples[0]);
    expect(store.schemaTriples$.get()[1]).toStrictEqual(defaultTriples[1]);
    expect(store.schemaTriples$.get()[2]).toStrictEqual(defaultTriples[2]);
    expect(store.typeTriples$.get()).toStrictEqual([]);
  });

  it('Returns schema placeholders for text attributes', async () => {
    const typeTriple = MockNetworkData.makeStubTripleWithType('SomeTypeId');
    const initialEntityStoreTriples = [typeTriple];

    const storage = new StorageClient(options.production.ipfs);
    const actionsStore = new ActionsStore({ storageClient: storage });

    const store = new EntityStore({
      id: 'e',
      spaceId: 's',
      initialTriples: initialEntityStoreTriples,
      initialSchemaTriples: [],
      ActionsStore: actionsStore,
      initialBlockIdsTriple: null,
      initialBlockTriples: [],
      subgraph: Subgraph,
      config: options.production,
    });

    expect(store.schemaTriples$.get()).toHaveLength(3);
    expect(store.schemaTriples$.get()[0].placeholder).toBeTruthy();
    expect(store.schemaTriples$.get()[0].value.type).toStrictEqual('string');
  });
});
