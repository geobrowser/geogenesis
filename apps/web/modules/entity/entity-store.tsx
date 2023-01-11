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
  abortController: AbortController = new AbortController();

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
        this.abortController.abort();
        this.abortController = new AbortController();

        try {
          /* In the edit-events reducer, deleting the last entity of a triple will create a mock entity with no value to persist the Attribute field. 
        Filtering out those entities here. */
          const typeTriples = this.typeTriples$.get().filter(triple => triple.value.id !== '');

          if (typeTriples.length === 0) {
            return [];
          }

          const attributes = await Promise.all(
            typeTriples.map(triple => {
              return this.api.fetchTriples({
                query: '',
                space: spaceId,
                first: 100,
                abortController: this.abortController,
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

          const attributeTriples = attributes.flatMap(attribute => attribute.triples);

          const valueTypes = await Promise.all(
            attributeTriples.map(attribute => {
              return this.api.fetchTriples({
                query: '',
                space: spaceId,
                first: 100,
                skip: 0,
                abortController: this.abortController,
                filter: [
                  {
                    field: 'entity-id',
                    value: attribute.value.id,
                  },
                  {
                    field: 'attribute-id',
                    value: SYSTEM_IDS.VALUE_TYPE,
                  },
                ],
              });
            })
          );

          const valueTypeTriples = valueTypes.flatMap(valueType => valueType.triples);

          return attributeTriples.map((attribute, index) => {
            const valueType = valueTypeTriples[index]?.value.id;
            return {
              ...Triple.emptyPlaceholder(spaceId, id, valueType),
              attributeId: attribute.value.id,
              attributeName: Value.nameOfEntityValue(attribute),
            };
          });
        } catch (e) {
          return [];
        }
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
