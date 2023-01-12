import { SYSTEM_IDS } from '@geogenesis/ids';
import { computed, Observable, observable, ObservableComputed, observe } from '@legendapp/state';
import { A } from '@mobily/ts-belt';
import { ActionsStore } from '../action';
import { INetwork } from '../services/network';
import { Triple } from '../triple';
import { Triple as TripleType } from '../types';
import { Value } from '../value';

interface IEntityStore {
  create(triple: TripleType): void;
  update(triple: TripleType, oldTriple: TripleType): void;
  remove(triple: TripleType): void;
}

export const createInitialDefaultTriples = (spaceId: string, entityId: string): TripleType[] => {
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
  initialSchemaTriples: TripleType[];
  ActionsStore: ActionsStore;
}

export class EntityStore implements IEntityStore {
  private api: INetwork;
  id: string;
  spaceId: string;
  triples$: ObservableComputed<TripleType[]>;
  typeIds$: ObservableComputed<string[]>;
  schemaTriples$: Observable<TripleType[]> = observable<TripleType[]>([]);
  hiddenSchemaIds$: Observable<string[]> = observable<string[]>([]);
  ActionsStore: ActionsStore;
  abortController: AbortController = new AbortController();

  constructor({ api, initialTriples, initialSchemaTriples, spaceId, id, ActionsStore }: IEntityStoreConfig) {
    const initialDefaultTriples =
      initialTriples.length === 0 ? createInitialDefaultTriples(spaceId, id) : initialTriples;

    this.id = id;
    this.api = api;
    this.triples$ = observable(initialDefaultTriples);
    this.schemaTriples$ = observable(initialSchemaTriples);
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
      return Triple.fromActions(entitySpecificActions, initialDefaultTriples);
    });

    /* In the edit-events reducer, deleting the last entity of a triple will create a mock entity with no value to persist the Attribute field. 
      Filtering out those entities here. */
    this.typeIds$ = computed(() => {
      return this.triples$
        .get()
        .filter(triple => triple.attributeId === SYSTEM_IDS.TYPES && triple.value.id !== '')
        .map(t => t.value.id);
    });

    observe<string[]>(e => {
      const typeIds = this.typeIds$.get();
      const previous = e.previous || [];

      if (!A.eq(previous, typeIds, (a, b) => a === b)) {
        this.setSchemaTriples(typeIds);
      }

      return typeIds;
    });
  }

  setSchemaTriples = async (typeIds: string[]) => {
    this.abortController.abort();
    this.abortController = new AbortController();

    try {
      if (typeIds.length === 0) {
        this.schemaTriples$.set([]);
      }

      const attributes = await Promise.all(
        typeIds.map(triple => {
          return this.api.fetchTriples({
            query: '',
            space: this.spaceId,
            first: 100,
            abortController: this.abortController,
            skip: 0,
            filter: [
              {
                field: 'entity-id',
                value: triple,
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
            space: this.spaceId,
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

      const schemaTriples = attributeTriples.map((attribute, index) => {
        const valueType = valueTypeTriples[index]?.value.id;

        return {
          ...Triple.emptyPlaceholder(this.spaceId, this.id, valueType),
          attributeId: attribute.value.id,
          attributeName: Value.nameOfEntityValue(attribute),
        };
      });

      this.schemaTriples$.set(schemaTriples);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return;
      }

      this.schemaTriples$.set([]);
    }
  };

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
