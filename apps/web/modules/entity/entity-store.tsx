import { computed, observable, ObservableComputed } from '@legendapp/state';
import { ActionsStore } from '../action';
import { SYSTEM_IDS } from '../constants';
import { INetwork } from '../services/network';
import { Triple } from '../triple';
import { Triple as TripleType } from '../types';
import { makeOptionalComputed } from '../utils';

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
  typeAttributes$: ObservableComputed<TripleType[]> = observable([]);
  ActionsStore: ActionsStore;

  constructor({ api, initialTriples, spaceId, id, ActionsStore }: IEntityStoreConfig) {
    const initialDefaultTriples =
      initialTriples.length === 0 ? createInitialDefaultTriples(spaceId, id) : initialTriples;

    this.api = api;
    this.triples$ = observable(initialDefaultTriples);
    this.spaceId = spaceId;
    this.ActionsStore = ActionsStore;

    this.triples$ = computed(() => {
      const actions = ActionsStore.actions$.get()[spaceId];

      // We want to merge any local actions with the network triples
      return Triple.fromActions(spaceId, actions, initialDefaultTriples);
    });

    this.typeTriples$ = computed(() => {
      return this.triples$.get().filter(triple => triple.attributeId === SYSTEM_IDS.TYPES);
    });

    this.typeAttributes$ = makeOptionalComputed(
      [],
      computed(async () => {
        const typeTriples = this.typeTriples$.get();

        console.log('typeTriples', typeTriples);
        if (typeTriples.length === 0) {
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

        return attributes.map(attribute => attribute.triples).flat();
      })
    );
  }

  create = (triple: TripleType) => this.ActionsStore.create(triple);
  remove = (triple: TripleType) => this.ActionsStore.remove(triple);
  update = (triple: TripleType, oldTriple: TripleType) => this.ActionsStore.update(triple, oldTriple);
}
