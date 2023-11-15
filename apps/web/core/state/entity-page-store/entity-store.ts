import { SYSTEM_IDS } from '@geogenesis/ids';
import { Observable, ObservableComputed, computed, observable, observe } from '@legendapp/state';
import { A, pipe } from '@mobily/ts-belt';

import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { Triple as ITriple } from '~/core/types';
import { Action } from '~/core/utils/action';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { Value } from '~/core/utils/value';
import { ValueTypeId } from '~/core/value-types';

import { ActionsStore } from '../actions-store/actions-store';

interface IEntityStore {
  create(triple: ITriple): void;
  update(triple: ITriple, oldTriple: ITriple): void;
  remove(triple: ITriple): void;
}

export const createInitialDefaultTriples = (spaceId: string, entityId: string): ITriple[] => {
  const nameTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName: '',
    attributeName: 'Name',
    attributeId: SYSTEM_IDS.NAME,
    placeholder: true,
    value: {
      id: '',
      type: 'string',
      value: '',
    },
  });

  const descriptionTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName: '',
    attributeName: 'Description',
    attributeId: SYSTEM_IDS.DESCRIPTION,
    placeholder: true,
    value: {
      id: '',
      type: 'string',
      value: '',
    },
  });

  const typeTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName: '',
    attributeName: 'Types',
    attributeId: SYSTEM_IDS.TYPES,
    placeholder: true,
    value: {
      id: '',
      type: 'entity',
      name: '',
    },
  });

  return [nameTriple, descriptionTriple, typeTriple];
};

const DEFAULT_PAGE_SIZE = 100;

interface IEntityStoreConfig {
  subgraph: Subgraph.ISubgraph;
  config: Environment.AppConfig;
  spaceId: string;
  id: string;
  initialTriples: ITriple[];
  initialSchemaTriples: ITriple[];
  ActionsStore: ActionsStore;
}

export class EntityStore implements IEntityStore {
  private subgraph: Subgraph.ISubgraph;
  private config: Environment.AppConfig;
  id: string;
  spaceId: string;
  triples$: ObservableComputed<ITriple[]>;
  typeTriples$: ObservableComputed<ITriple[]>;
  schemaTriples$: Observable<ITriple[]> = observable<ITriple[]>([]);
  hiddenSchemaIds$: Observable<string[]> = observable<string[]>([]);
  ActionsStore: ActionsStore;
  abortController: AbortController = new AbortController();
  name$: ObservableComputed<string>;

  constructor({
    initialTriples,
    initialSchemaTriples,
    spaceId,
    id,
    ActionsStore,
    subgraph,
    config,
  }: IEntityStoreConfig) {
    const defaultTriples = createInitialDefaultTriples(spaceId, id);

    this.subgraph = subgraph;
    this.config = config;
    this.id = id;
    this.schemaTriples$ = observable([...initialSchemaTriples, ...defaultTriples]);
    this.spaceId = spaceId;
    this.ActionsStore = ActionsStore;

    this.triples$ = computed(() => {
      const spaceActions = ActionsStore.actions$.get()[spaceId] ?? [];

      return pipe(
        spaceActions,
        actions => Action.squashChanges(actions),
        actions => Triple.fromActions(actions, initialTriples),
        A.filter(t => t.entityId === id),
        triples =>
          // We may be referencing attributes/entities from other spaces whose name has changed.
          // We pass _all_ local changes instead of just the current space changes.
          Triple.withLocalNames(
            Object.values(ActionsStore.actions$.get()).flatMap(a => a),
            triples
          )
      );
    });

    this.name$ = computed(() => {
      return Entity.name(this.triples$.get()) || '';
    });

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
    observe<ITriple[]>(e => {
      const typeTriples = this.typeTriples$.get();
      const previous = e.previous || [];

      // @TODO: This isn't working
      if (!A.eq(previous, typeTriples, (a, b) => a.value.id === b.value.id)) {
        this.setSchemaTriples(typeTriples);
      }

      return typeTriples;
    });
  }

  setSchemaTriples = async (typeTriples: ITriple[]) => {
    this.abortController.abort();
    this.abortController = new AbortController();

    try {
      if (typeTriples.length === 0) {
        this.schemaTriples$.set([]);
      }

      const attributesOnType = await Promise.all(
        typeTriples.map(triple => {
          return this.subgraph.fetchTriples({
            endpoint: this.config.subgraph,
            query: '',
            first: DEFAULT_PAGE_SIZE,
            signal: this.abortController.signal,
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

      const attributeTriples = attributesOnType.flatMap(triples => triples);

      const valueTypesForAttributes = await Promise.all(
        attributeTriples.map(attribute => {
          return this.subgraph.fetchTriples({
            endpoint: this.config.subgraph,
            query: '',
            first: DEFAULT_PAGE_SIZE,
            skip: 0,
            signal: this.abortController.signal,
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

      const valueTypeTriples = valueTypesForAttributes.flatMap(triples => triples);

      const valueTypesToAttributesMap = attributeTriples.reduce<Record<string, ValueTypeId | undefined>>(
        (acc, attribute) => {
          acc[attribute.value.id] = valueTypeTriples.find(t => t.entityId === attribute.value.id)?.value
            .id as ValueTypeId;
          return acc;
        },
        {}
      );

      const schemaTriples = attributeTriples.map(attribute => {
        const valueType = valueTypesToAttributesMap[attribute.value.id];

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

  create = (triple: ITriple) => this.ActionsStore.create(triple);
  remove = (triple: ITriple) => this.ActionsStore.remove(triple);
  update = (triple: ITriple, oldTriple: ITriple) => this.ActionsStore.update(triple, oldTriple);
}
