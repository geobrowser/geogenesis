import { computed, ObservableComputed } from '@legendapp/state';
import { Observable, observable } from '@legendapp/state';
import { Signer } from 'ethers';
import { SYSTEM_IDS } from '../constants';
import { Triple } from '../triple';
import { INetwork } from '../services/network';
import {
  Action,
  CreateTripleAction,
  DeleteTripleAction,
  EditTripleAction,
  ReviewState,
  Triple as TripleType,
} from '../types';

// HACK: We're adding attributeName since we need it to update the entityNames object.
// In the near future we'll be merging entity/attribute names into the triple at
// request time instead of infecting the codebase with entityName checks.
interface IEntityStore {
  create(triple: TripleType): void;
  update(triple: TripleType, oldTriple: TripleType): void;
  remove(triples: TripleType[]): void;
  publish(signer: Signer, onChangePublishState: (newState: ReviewState) => void): void;
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
}

export class EntityStore implements IEntityStore {
  private api: INetwork;
  spaceId: string;
  triples$: ObservableComputed<TripleType[]>;
  actions$: Observable<Action[]>;

  constructor({ api, initialTriples, spaceId, id }: IEntityStoreConfig) {
    const initialDefaultTriples =
      initialTriples.length === 0 ? createInitialDefaultTriples(spaceId, id) : initialTriples;

    this.api = api;
    this.triples$ = observable(initialDefaultTriples);
    this.actions$ = observable<Action[]>([]);
    this.spaceId = spaceId;

    this.triples$ = computed(() => {
      // We operate on the triples array in reverse so that we can `push` instead of `unshift`
      // when creating new triples, which is significantly faster.
      const triples: TripleType[] = [...initialDefaultTriples].reverse();

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
              triples.push(Triple.withId({ ...action, space: spaceId }));
              break;
            }

            triples.splice(indexOfSiblingTriples, 0, Triple.withId({ ...action, space: spaceId }));
            break;
          }
          case 'deleteTriple': {
            const index = triples.findIndex(t => t.id === Triple.withId({ ...action, space: spaceId }).id);
            triples.splice(index, 1);
            break;
          }
          case 'editTriple': {
            const index = triples.findIndex(t => t.id === Triple.withId({ ...action.before, space: spaceId }).id);
            triples[index] = Triple.withId({ ...action.after, space: spaceId });
            break;
          }
        }
      });

      return triples;
    });
  }

  create = (triple: TripleType) => {
    const action: CreateTripleAction = {
      ...triple,
      type: 'createTriple',
    };

    this.actions$.set([...this.actions$.get(), action]);
  };

  remove = (triples: TripleType[]) => {
    const actions: DeleteTripleAction[] = triples.map(triple => ({
      ...triple,
      type: 'deleteTriple',
    }));

    this.actions$.set([...this.actions$.get(), ...actions]);
  };

  update = (triple: TripleType, oldTriple: TripleType) => {
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

    this.actions$.set([...this.actions$.get(), action]);
  };

  publish = async (signer: Signer, onChangePublishState: (newState: ReviewState) => void) => {
    await this.api.publish({ actions: this.actions$.get(), signer, onChangePublishState, space: this.spaceId });
    this.actions$.set([]);
  };
}
