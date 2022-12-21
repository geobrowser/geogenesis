import { computed, ObservableComputed } from '@legendapp/state';
import { observable } from '@legendapp/state';
import { SYSTEM_IDS } from '../constants';
import { Triple } from '../triple';
import { INetwork } from '../services/network';
import { Triple as TripleType } from '../types';
import { ActionsStore } from './actions-store';

// HACK: We're adding attributeName since we need it to update the entityNames object.
// In the near future we'll be merging entity/attribute names into the triple at
// request time instead of infecting the codebase with entityName checks.
interface IEntityStore {
  create(triple: TripleType): void;
  update(triple: TripleType, oldTriple: TripleType): void;
  remove(triples: TripleType[]): void;
}

const createInitialDefaultTriples = (spaceId: string, entityId: string): TripleType[] => {
  return [
    Triple.withId({
      space: spaceId,
      entityId,
      entityName: '',
      attributeName: 'Types',
      attributeId: SYSTEM_IDS.TYPE,
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
  ActionsStore: ActionsStore;

  constructor({ api, initialTriples, spaceId, id, ActionsStore }: IEntityStoreConfig) {
    const initialDefaultTriples =
      initialTriples.length === 0 ? createInitialDefaultTriples(spaceId, id) : initialTriples;

    this.api = api;
    this.triples$ = observable(initialDefaultTriples);
    this.spaceId = spaceId;
    this.ActionsStore = ActionsStore;

    this.triples$ = computed(() => {
      // We operate on the triples array in reverse so that we can `push` instead of `unshift`
      // when creating new triples, which is significantly faster.
      const actions = ActionsStore.actions$.get()[spaceId];

      // If our actions have modified one of the network triples, we don't want to add that
      // network triple to the triples array
      return Triple.fromActions(spaceId, actions, initialDefaultTriples);
    });
  }

  create = (triple: TripleType) => this.ActionsStore.create(triple);
  remove = (triples: TripleType[]) => this.ActionsStore.remove(triples);
  update = (triple: TripleType, oldTriple: TripleType) => this.ActionsStore.update(triple, oldTriple);
}
