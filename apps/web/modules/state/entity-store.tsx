import { computed, ObservableComputed } from '@legendapp/state';
import { Observable, observable } from '@legendapp/state';
import { Signer } from 'ethers';
import { CreateTripleAction } from '~/../../packages/action-schema/dist/src';
import { createTripleWithId } from '../services/create-id';
import { INetwork } from '../services/network';
import { Action, EditTripleAction, EntityNames, ReviewState, Triple } from '../types';

interface IEntityStore {
  create(triples: Triple[]): void;
  update(triple: Triple, oldTriple: Triple): void;
  publish(signer: Signer, onChangePublishState: (newState: ReviewState) => void): void;
}

interface IEntityStoreConfig {
  api: INetwork;
  spaceId: string;
  initialTriples: Triple[];
  initialEntityNames: EntityNames;
}

export class EntityStore implements IEntityStore {
  private api: INetwork;
  spaceId: string;
  triples$: ObservableComputed<Triple[]>;
  entityNames$: Observable<EntityNames>;
  actions$: Observable<Action[]>;

  constructor({ api, initialEntityNames, initialTriples, spaceId }: IEntityStoreConfig) {
    this.api = api;
    this.triples$ = observable(initialTriples);
    this.entityNames$ = observable(initialEntityNames);
    this.actions$ = observable<Action[]>([]);
    this.spaceId = spaceId;

    this.triples$ = computed(() => {
      // We operate on the triples array in reverse so that we can `push` instead of `unshift`
      // when creating new triples, which is significantly faster.
      const triples: Triple[] = [...initialTriples].reverse();

      // If our actions have modified one of the network triples, we don't want to add that
      // network triple to the triples array
      this.actions$.get().forEach(action => {
        switch (action.type) {
          case 'createTriple':
            triples.push(createTripleWithId({ ...action, space: spaceId }));
            break;
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

      return triples.reverse();
    });
  }

  create = (triples: Triple[]) => {
    const actions: CreateTripleAction[] = triples.map(triple => ({
      ...triple,
      type: 'createTriple',
    }));

    this.actions$.set([...this.actions$.get(), ...actions]);
  };

  update = (triple: Triple, oldTriple: Triple) => {
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
