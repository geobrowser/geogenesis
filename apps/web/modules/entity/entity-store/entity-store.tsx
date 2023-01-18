import { SYSTEM_IDS } from '@geogenesis/ids';
import { computed, Observable, observable, ObservableComputed, observe } from '@legendapp/state';
import { A, pipe } from '@mobily/ts-belt';
import { ActionsStore } from '~/modules/action';
import { INetwork } from '~/modules/services/network';
import { Triple } from '~/modules/triple';
import { Triple as TripleType } from '~/modules/types';
import { makeOptionalComputed } from '~/modules/utils';
import { Value } from '~/modules/value';

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

const DEFAULT_PAGE_SIZE = 100;

interface IEntityStoreConfig {
  api: INetwork;
  spaceId: string;
  id: string;
  ActionsStore: ActionsStore;
}

export class EntityStore implements IEntityStore {
  private api: INetwork;
  id: string;
  spaceId: string;
  triples$: ObservableComputed<TripleType[]>;
  typeTriples$: ObservableComputed<TripleType[]>;
  schemaTriples$: Observable<TripleType[]> = observable<TripleType[]>([]);
  hiddenSchemaIds$: Observable<string[]> = observable<string[]>([]);
  ActionsStore: ActionsStore;
  abortController: AbortController = new AbortController();

  constructor({ api, spaceId, id, ActionsStore }: IEntityStoreConfig) {
    this.id = id;
    this.api = api;
    this.spaceId = spaceId;
    this.ActionsStore = ActionsStore;

    const serverTriples$ = makeOptionalComputed(
      [],
      computed(async () => {
        const serverTriples = await this.api.fetchTriples({
          space: spaceId,
          query: '',
          skip: 0,
          first: DEFAULT_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: this.id }],
        });

        return serverTriples.triples;
      })
    );

    this.triples$ = makeOptionalComputed(
      [],
      computed(async () => {
        const spaceActions = ActionsStore.actions$.get()[spaceId] || [];

        return pipe(
          spaceActions,
          A.filter(a => {
            const isCreate = a.type === 'createTriple' && a.entityId === id;
            const isDelete = a.type === 'deleteTriple' && a.entityId === id;
            const isRemove = a.type === 'editTriple' && a.before.entityId === id;

            return isCreate || isDelete || isRemove;
          }),
          actions => Triple.fromActions(actions, serverTriples$.get()),
          triples => Triple.withLocalNames(spaceActions, triples)
        );
      })
    );

    /* 
    In the edit-events reducer, deleting the last entity of a triple will create a mock entity with no value to 
    persist the Attribute field. Filtering out those entities here. 
    */
    this.typeTriples$ = computed(() => {
      return this.triples$.get().filter(triple => triple.attributeId === SYSTEM_IDS.TYPES && triple.value.id !== '');
    });

    /* 
    Computed values in @legendapp/state will rerun for every change recursively up the tree.   
    This is problematic when the computed value is expensive to compute or involves a network request.
    To avoid this, we can use the observe function to only run the computation when the direct dependencies change.
    */
    observe<TripleType[]>(e => {
      const typeTriples = this.typeTriples$.get();
      const previous = e.previous || [];

      if (!A.eq(previous, typeTriples, (a, b) => a.value.id === b.value.id)) {
        this.setSchemaTriples(typeTriples);
      }

      return typeTriples;
    });
  }

  setSchemaTriples = async (typeTriples: TripleType[]) => {
    this.abortController.abort();
    this.abortController = new AbortController();

    try {
      if (typeTriples.length === 0) {
        this.schemaTriples$.set([]);
      }

      const attributes = await Promise.all(
        typeTriples.map(triple => {
          return this.api.fetchTriples({
            query: '',
            first: DEFAULT_PAGE_SIZE,
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
            first: DEFAULT_PAGE_SIZE,
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
