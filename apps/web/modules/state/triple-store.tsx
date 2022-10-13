import { Signer } from 'ethers';
import { BehaviorSubject, combineLatest, merge, zip } from 'rxjs';
import { CreateTripleAction, DeleteTripleAction } from '@geogenesis/action-schema';
import { INetwork } from '../services/network';
import { EntityNames, ReviewState, Triple } from '../types';
import { createTripleId, createTripleWithId } from '../services/create-id';

interface ITripleStore {
  actions$: BehaviorSubject<Action[]>;
  create(triples: Triple[]): void;
  update(triple: Triple, oldTriple: Triple): void;
  publish(signer: Signer, onChangePublishState: (newState: ReviewState) => void): void;
}

interface ITripleStoreConfig {
  api: INetwork;
}

// Local triple
// creates a new triple -> CreateTripleAction
// updates an existing triple ->
type EditTripleAction = {
  type: 'editTriple';
  before: DeleteTripleAction;
  after: CreateTripleAction;
};

export type Action = CreateTripleAction | DeleteTripleAction | EditTripleAction;

export class TripleStore implements ITripleStore {
  private api: INetwork;
  // observables
  // A: ~~actions (created and deleted) (will need to squash intermediate states or a different DS)~~
  // B: network triples (whatever we fetch from the network via querying)
  // C: network entity names
  // D: entity names (derived from A and B, C)
  actions$: BehaviorSubject<Action[]> = new BehaviorSubject<Action[]>([]);
  entityNames$: BehaviorSubject<EntityNames> = new BehaviorSubject<EntityNames>({});
  triples$ = new BehaviorSubject<Triple[]>([]);

  networkTriples$ = new BehaviorSubject<Triple[]>([]);
  networkEntityNames$ = new BehaviorSubject<EntityNames>({});

  constructor({ api }: ITripleStoreConfig) {
    this.api = api;

    combineLatest([this.actions$, this.networkTriples$]).subscribe(([actions, networkTriples]) => {
      const triples: Triple[] = [...networkTriples];

      // We need to create a Set of all the networkTriples' ids

      // If our actions have modified one of the network triples, we don't want to add that
      // network triple to the triples array
      actions.forEach(action => {
        switch (action.type) {
          case 'createTriple':
            triples.unshift(createTripleWithId(action));
            break;
          case 'deleteTriple': {
            const index = triples.findIndex(t => t.id === createTripleWithId(action).id);
            triples.splice(index, 1);
            break;
          }
          case 'editTriple': {
            const index = triples.findIndex(t => t.id === createTripleWithId(action.before).id);
            triples.splice(index, 1, createTripleWithId(action.after));
            break;
          }
        }
      });

      this.triples$.next(triples);
    });

    this.api.query$.subscribe(async value => {
      const { triples, entityNames } = await this.api.getNetworkTriples(value);
      this.networkEntityNames$.next(entityNames);
      this.networkTriples$.next(triples);
    });

    // Name-related stuff
    combineLatest([this.actions$, this.networkEntityNames$]).subscribe(([actions, networkEntityNames]) => {
      const entityNames = actions.reduce(
        (acc, action) => {
          switch (action.type) {
            case 'createTriple':
              if (action.attributeId === 'name') {
                acc[action.entityId] = action.value.value;
              }

              break;
            case 'deleteTriple':
              break;
            case 'editTriple':
              if (action.after.attributeId === 'name') {
                acc[action.after.entityId] = action.after.value.value;
              }

              break;
          }

          return acc;
        },
        { ...networkEntityNames } as EntityNames
      );

      this.entityNames$.next(entityNames);
    });
  }

  create = (triples: Triple[]) => {
    const actions: CreateTripleAction[] = triples.map(triple => ({
      ...triple,
      type: 'createTriple',
    }));

    this.actions$.next([...actions, ...this.actions$.value]);
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

    this.actions$.next([action, ...this.actions$.value]);
  };

  publish = async (signer: Signer, onChangePublishState: (newState: ReviewState) => void) => {
    // await this.api.publish(this.actions$.value, signer, onChangePublishState);
    console.log(this.actions$.value);
    this.actions$.next([]);
  };

  setQuery = (query: string) => {
    this.api.query$.next(query);
  };

  get triples() {
    return this.triples$.value;
  }

  get actions() {
    return this.actions$.value;
  }
}
