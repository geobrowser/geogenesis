import { when } from '@legendapp/state';
import { describe, expect, it } from 'vitest';
import { ActionsStore } from '../action';
import { makeStubTriple, makeStubTripleTyped, makeStubType, MockNetwork } from '../services/mock-network';
import { createInitialDefaultTriples, EntityStore } from './entity-store';

describe('EntityStore', () => {
  it('Initializes to defaults', async () => {
    const network = new MockNetwork();
    const store = new EntityStore({
      id: 'e',
      api: network,
      spaceId: 's',
      initialTriples: [],
      ActionsStore: new ActionsStore({ api: network }),
    });
    const defaultTriples = createInitialDefaultTriples('s', 'e');

    const triples = store.triples$.get();

    expect(triples).toHaveLength(1);
    expect(triples[0]).toStrictEqual(defaultTriples[0]);
    expect(store.schemaTriples$.get()).toStrictEqual([]);
    expect(store.typeIds$.get()).toStrictEqual([]);
  });

  it('Computes type IDs from initial triples', async () => {
    const aliceTriple = makeStubTriple('Alice');
    const typeTriple = makeStubType('Person');
    const aliceTypeTriple = makeStubTripleTyped(aliceTriple, typeTriple.entityId);

    const initialEntityStoreTriples = [aliceTriple, aliceTypeTriple];

    const network = new MockNetwork({ triples: [] });

    const store = new EntityStore({
      id: aliceTriple.id,
      api: network,
      spaceId: 's',
      initialTriples: initialEntityStoreTriples,
      ActionsStore: new ActionsStore({ api: network }),
    });

    await when(() => store.triples$.get().length > 0 && store.typeIds$.get().length > 0);

    expect(store.triples$.get()).toStrictEqual(initialEntityStoreTriples);
    expect(store.typeIds$.get()).toStrictEqual(['Person']);
  });

  it('Default to string schemas for types', async () => {
    const aliceTriple = makeStubTriple('Alice');
    const typeTriple = makeStubType('Person');
    const aliceTypeTriple = makeStubTripleTyped(aliceTriple, typeTriple.entityId);

    const initialNetworkTriples = [aliceTriple, typeTriple, aliceTypeTriple];
    const initialEntityStoreTriples = [aliceTriple, aliceTypeTriple];

    const network = new MockNetwork({ triples: initialNetworkTriples });

    const store = new EntityStore({
      id: aliceTriple.id,
      api: network,
      spaceId: 's',
      initialTriples: initialEntityStoreTriples,
      ActionsStore: new ActionsStore({ api: network }),
    });

    await when(
      () => store.triples$.get().length > 0 && store.typeIds$.get().length > 0 && store.schemaTriples$.get().length > 0
    );

    expect(store.triples$.get()).toStrictEqual(initialEntityStoreTriples);
    expect(store.typeIds$.get()).toStrictEqual(['Person']);
    expect(store.schemaTriples$.get()).toHaveLength(1);
    expect(store.schemaTriples$.get()[0]).toStrictEqual(3);
  });
});
