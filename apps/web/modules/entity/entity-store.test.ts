import { when } from '@legendapp/state';
import { describe, expect, it } from 'vitest';
import { ActionsStore } from '../action';
import { makeStubTextAttribute, makeStubTripleWithType, MockNetwork } from '../services/mock-network';
import { createInitialDefaultTriple, EntityStore } from './entity-store/entity-store';

describe('EntityStore', () => {
  it('Initializes to defaults', async () => {
    const network = new MockNetwork();
    const store = new EntityStore({
      id: 'e',
      api: network,
      spaceId: 's',
      initialTriples: [],
      initialSchemaTriples: [],
      ActionsStore: new ActionsStore({ api: network }),
    });

    const defaultTriple = createInitialDefaultTriple('s', 'e');

    const triples = store.triples$.get();

    expect(triples).toHaveLength(0);
    expect(triples).toStrictEqual([]);
    expect(store.schemaTriples$.get()).toStrictEqual([defaultTriple]);
    expect(store.typeTriples$.get()).toStrictEqual([]);
  });

  it('Returns type triples', async () => {
    const typeTriple = makeStubTripleWithType('SomeTypeId');

    const initialEntityStoreTriples = [typeTriple];

    const network = new MockNetwork({ triples: [] });

    const store = new EntityStore({
      id: 'e',
      api: network,
      spaceId: 's',
      initialTriples: initialEntityStoreTriples,
      initialSchemaTriples: [],
      ActionsStore: new ActionsStore({ api: network }),
    });

    await when(() => store.triples$.get().length > 0 && store.typeTriples$.get().length > 0);

    expect(store.triples$.get()).toStrictEqual(initialEntityStoreTriples);
    expect(store.typeTriples$.get()[0]).toStrictEqual(typeTriple);
  });

  it('Returns schema placeholders for text attributes', async () => {
    const typeTriple = makeStubTripleWithType('SomeTypeId');
    const textAttribute = makeStubTextAttribute('Nickname');
    const initialEntityStoreTriples = [typeTriple];

    const network = new MockNetwork({ triples: [textAttribute] });

    const store = new EntityStore({
      id: 'e',
      api: network,
      spaceId: 's',
      initialTriples: initialEntityStoreTriples,
      initialSchemaTriples: [],
      ActionsStore: new ActionsStore({ api: network }),
    });

    await when(
      () =>
        store.triples$.get().length > 0 && store.typeTriples$.get().length > 0 && store.schemaTriples$.get().length > 0
    );

    expect(store.schemaTriples$.get()).toHaveLength(1);
    expect(store.schemaTriples$.get()[0].placeholder).toBeTruthy();
    expect(store.schemaTriples$.get()[0].value.type).toStrictEqual('entity');
  });
});
