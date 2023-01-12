import { when } from '@legendapp/state';
import { describe, expect, it } from 'vitest';
import { ActionsStore } from '../action';
import { makeStubTextAttribute, makeStubTripleWithType, MockNetwork } from '../services/mock-network';
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

  it('Returns type IDs', async () => {
    const typeTriple = makeStubTripleWithType('SomeTypeId');

    const initialEntityStoreTriples = [typeTriple];

    const network = new MockNetwork({ triples: [] });

    const store = new EntityStore({
      id: 'e',
      api: network,
      spaceId: 's',
      initialTriples: initialEntityStoreTriples,
      ActionsStore: new ActionsStore({ api: network }),
    });

    await when(() => store.triples$.get().length > 0 && store.typeIds$.get().length > 0);

    console.log(store.typeIds$.get());
    expect(store.triples$.get()).toStrictEqual(initialEntityStoreTriples);
    expect(store.typeIds$.get()).toStrictEqual(['SomeTypeId']);
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
      ActionsStore: new ActionsStore({ api: network }),
    });

    await when(
      () => store.triples$.get().length > 0 && store.typeIds$.get().length > 0 && store.schemaTriples$.get().length > 0
    );

    expect(store.schemaTriples$.get()).toHaveLength(1);
    expect(store.schemaTriples$.get()[0].placeholder).toBeTruthy();
    expect(store.schemaTriples$.get()[0].value.type).toStrictEqual('string');
  });
});
