import { SYSTEM_IDS } from '@geogenesis/ids';
import { computed, Observable, observable, ObservableComputed } from '@legendapp/state';
import { ActionsStore } from '../action';
import { INetwork } from '../services/network';
import { Triple } from '../triple';
import { Triple as TripleType } from '../types';
import { makeOptionalComputed } from '../utils';
import { Value } from '../value';

interface IEntityStore {
  create(triple: TripleType): void;
  update(triple: TripleType, oldTriple: TripleType): void;
  remove(triple: TripleType): void;
}

const createInitialDefaultTriples = (spaceId: string, entityId: string): TripleType[] => {
  return [
    Triple.withId({
      space: spaceId,
      entityId,
      entityName: '',
      attributeName: 'Types',
      attributeId: SYSTEM_IDS.TYPES,
      value: {
        id: '',
        type: 'entity',
        name: '',
      },
    }),
  ];
};

interface IEntityStoreConfig {
  api: INetwork;
  spaceId: string;
  id: string;
  initialTriples: TripleType[];
  ActionsStore: ActionsStore;
}

export class EntityStore implements IEntityStore {
  private api: INetwork;
  spaceId: string;
  triples$: ObservableComputed<TripleType[]>;
  typeTriples$: ObservableComputed<TripleType[]> = observable([]);
  schemaTriples$: ObservableComputed<TripleType[]> = observable([]);
  hiddenSchemaIds$: Observable<string[]> = observable<string[]>([]);
  ActionsStore: ActionsStore;

  constructor({ api, initialTriples, spaceId, id, ActionsStore }: IEntityStoreConfig) {
    const initialDefaultTriples =
      initialTriples.length === 0 ? createInitialDefaultTriples(spaceId, id) : initialTriples;

    this.api = api;
    this.triples$ = observable(initialDefaultTriples);
    this.spaceId = spaceId;
    this.ActionsStore = ActionsStore;

    this.triples$ = computed(() => {
      const actions = ActionsStore.actions$.get()[spaceId] || [];

      const entitySpecificActions = actions.filter(a => {
        const isCreate = a.type === 'createTriple' && a.entityId === id;
        const isDelete = a.type === 'deleteTriple' && a.entityId === id;
        const isRemove = a.type === 'editTriple' && a.before.entityId === id;

        return isCreate || isDelete || isRemove;
      });
      // We want to merge any local actions with the network triples
      return Triple.fromActions(spaceId, entitySpecificActions, initialDefaultTriples);
    });

    this.typeTriples$ = computed(() => {
      return this.triples$.get().filter(triple => triple.attributeId === SYSTEM_IDS.TYPES);
    });

    this.schemaTriples$ = makeOptionalComputed(
      [],
      computed(async () => {
        const typeTriples = this.typeTriples$.get();

        const noTypeTriples = typeTriples.length === 0;
        const defaultTypeTriples = typeTriples[0].value.id === '';

        if (noTypeTriples || defaultTypeTriples) {
          return [];
        }

        const attributes = await Promise.all(
          typeTriples.map(triple => {
            return this.api.fetchTriples({
              query: '',
              space: spaceId,
              first: 100,
              skip: 0,
              filter: [
                {
                  field: 'entity-id',
                  value: triple.value.id,
                },
                {
                  field: 'attribute-id',
                  value: SYSTEM_IDS.ATTRIBUTES,
                },
              ],
            });
          })
        );

        const hiddenSchemaIds = this.hiddenSchemaIds$.get();

        return attributes
          .flatMap(attribute => attribute.triples)
          .filter(triple => !hiddenSchemaIds.includes(triple.attributeId))
          .map(triple => ({
            ...Triple.empty(spaceId, id),
            attributeId: triple.value.id,
            attributeName: Value.nameOfEntityValue(triple), // Should we be grabbing all of the related triples for the attribute to see if it has a name triple?
            placeholder: true,
          }));
      })
    );
  }

  hideSchema = (id: string) => {
    const hiddenSchemaIds = this.hiddenSchemaIds$.get();
    if (!hiddenSchemaIds.includes(id)) {
      this.hiddenSchemaIds$.set([...hiddenSchemaIds, id]);
    }
  };

  create = (triple: TripleType) => this.ActionsStore.create(triple);
  remove = (triple: TripleType) => this.ActionsStore.remove(triple);
  update = (triple: TripleType, oldTriple: TripleType) => this.ActionsStore.update(triple, oldTriple);
}
