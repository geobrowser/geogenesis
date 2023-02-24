import { describe, expect, it } from 'vitest';
import { ActionsStore } from '../action';
import { makeStubTextAttribute, makeStubTripleWithType, MockNetwork } from '../services/mock-network';
import { createInitialDefaultTriples, EntityStore } from './entity-store/entity-store';

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

    expect(store.schemaTriples$.get()).toHaveLength(3);
    expect(store.schemaTriples$.get()[0].placeholder).toBeTruthy();
    expect(store.schemaTriples$.get()[0].value.type).toStrictEqual('string');
  });
});
