import { computed, ObservableComputed } from '@legendapp/state';
import { Observable, observable } from '@legendapp/state';
import { Signer } from 'ethers';
import { SYSTEM_IDS } from '../constants';
import { createTripleWithId } from '../services/create-id';
import { INetwork } from '../services/network';
import {
  Action,
  CreateTripleAction,
  DeleteTripleAction,
  EditTripleAction,
  EntityNames,
  ReviewState,
  Triple,
} from '../types';

// HACK: We're adding attributeName since we need it to update the entityNames object.
// In the near future we'll be merging entity/attribute names into the triple at
// request time instead of infecting the codebase with entityName checks.
interface IEntityStore {
  create(triple: Triple & { attributeName?: string | null }): void;
  update(triple: Triple & { attributeName?: string | null }, oldTriple: Triple): void;
  remove(triples: Triple[]): void;
  publish(actions: Action[], signer: Signer, onChangePublishState: (newState: ReviewState) => void): void;
}

const createInitialDefaultTriples = (spaceId: string, entityId: string): Triple[] => {
  return [
    createTripleWithId(spaceId, entityId, SYSTEM_IDS.TYPE, {
      id: '',
      type: 'entity',
    }),
  ];
};

const createInitialDefaultNames = (): EntityNames => {
  return {
    [SYSTEM_IDS.TYPE]: 'Types',
  };
};

interface IEntityStoreConfig {
  api: INetwork;
  spaceId: string;
  id: string;
  initialTriples: Triple[];
  initialEntityNames: EntityNames;
}

export class EntityStore implements IEntityStore {
  private api: INetwork;
  spaceId: string;
  triples$: ObservableComputed<Triple[]>;
  entityNames$: Observable<EntityNames>;
  actions$: Observable<Action[]>;

  constructor({ api, initialEntityNames, initialTriples, spaceId, id }: IEntityStoreConfig) {
    const initialDefaultTriples =
      initialTriples.length === 0 ? createInitialDefaultTriples(spaceId, id) : initialTriples;
    const initialDefaultNames =
      Object.entries(initialEntityNames).length === 0 ? createInitialDefaultNames() : initialEntityNames;

    this.api = api;
    this.triples$ = observable(initialDefaultTriples);
    this.entityNames$ = observable<EntityNames>(initialDefaultNames);
    this.actions$ = observable<Action[]>([]);
    this.spaceId = spaceId;

    this.triples$ = computed(() => {
      // We operate on the triples array in reverse so that we can `push` instead of `unshift`
      // when creating new triples, which is significantly faster.
      const triples: Triple[] = [...initialDefaultTriples].reverse();

      // If our actions have modified one of the network triples, we don't want to add that
      // network triple to the triples array
      this.actions$.get().forEach(action => {
        switch (action.type) {
          case 'createTriple': {
            // We may add a triple that has the same attributeId as other triples. We want to insert
            // the new triple into the triples array in the same place as the other triples so the
            // list doesn't reorder.
            const indexOfSiblingTriples = triples.findIndex(t => t.attributeId === action.attributeId);
            if (indexOfSiblingTriples === -1) {
              triples.push(createTripleWithId({ ...action, space: spaceId }));
              break;
            }

            triples.splice(indexOfSiblingTriples, 0, createTripleWithId({ ...action, space: spaceId }));
            break;
          }
          case 'deleteTriple': {
            const index = triples.findIndex(t => t.id === createTripleWithId({ ...action, space: spaceId }).id);
            triples.splice(index, 1);
            break;
          }
          case 'editTriple': {
            const index = triples.findIndex(t => t.id === createTripleWithId({ ...action.before, space: spaceId }).id);
            triples[index] = createTripleWithId({ ...action.after, space: spaceId });
            break;
          }
        }
      });

      return triples;
    });
  }

  create = (triple: Triple & { attributeName?: string | null }) => {
    const action: CreateTripleAction = {
      ...triple,
      type: 'createTriple',
    };

    const newEntityNames: EntityNames = {
      [triple.value.id]: triple.attributeName ?? null,
    };

    this.entityNames$.set({
      ...this.entityNames$.get(),
      ...newEntityNames,
    });

    this.actions$.set([...this.actions$.get(), action]);
  };

  remove = (triples: Triple[]) => {
    const actions: DeleteTripleAction[] = triples.map(triple => ({
      ...triple,
      type: 'deleteTriple',
    }));

    this.actions$.set([...this.actions$.get(), ...actions]);
  };

  update = (triple: Triple & { attributeName?: string | null }, oldTriple: Triple) => {
    const action: EditTripleAction = {
      type: 'editTriple',
      before: {
        ...oldTriple,
        type: 'deleteTriple',
      },
      after: {
        ...triple,
        type: 'createTriple',
      },
    };

    console.log(triple, oldTriple);

    const entityNames = this.entityNames$.get();

    const newEntityNames: EntityNames = {
      [triple.attributeId]: entityNames[triple.attributeId]
        ? entityNames[triple.attributeId]
        : triple.attributeName ?? null,
      [triple.value.id]: entityNames[triple.value.id] ? entityNames[triple.value.id] : triple.attributeName ?? null,
    };

    this.entityNames$.set({
      ...entityNames,
      ...newEntityNames,
    });

    this.actions$.set([...this.actions$.get(), action]);
  };

  publish = async (actions: Action[], signer: Signer, onChangePublishState: (newState: ReviewState) => void) => {
    await this.api.publish({ actions, signer, onChangePublishState, space: this.spaceId });
    this.actions$.set([]);
  };
}
