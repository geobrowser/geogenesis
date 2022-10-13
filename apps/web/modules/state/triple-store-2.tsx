import { Signer } from 'ethers';
import { BehaviorSubject, zip } from 'rxjs';
import { CreateTripleAction, DeleteTripleAction } from '@geogenesis/action-schema';
import { INetwork } from '../services/network';
import { EntityNames, ReviewState, Triple } from '../types';
import { createTripleWithId } from '../services/create-id';

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

type Action = CreateTripleAction | DeleteTripleAction | EditTripleAction;

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

  // TODO: Delete
  changedTriples$ = new BehaviorSubject<Triple[]>([]);

  constructor({ api }: ITripleStoreConfig) {
    this.api = api;

    // zip(actions, networkTriples);
    // zip(actions, networkEntityNames);

    this.api.query$.subscribe(async value => {
      const { triples, entityNames } = await this.api.getNetworkTriples(value);
      this.triples$.next(triples);
      this.entityNames$.next(entityNames);
    });

    // Triple-related stuff
    this.actions$.subscribe(actions => {
      const triples: Triple[] = [];

      actions.forEach(action => {
        switch (action.type) {
          case 'createTriple':
            triples.push(createTripleWithId(action));
            break;
          case 'deleteTriple':
            break;
          case 'editTriple':
            triples.push(createTripleWithId(action.after));
            break;
        }
      });

      this.triples$.next(triples);
    });

    // Name-related stuff
    this.actions$.subscribe(actions => {
      const entityNames = actions.reduce((acc, action) => {
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
      }, {} as EntityNames);

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

  update = (triple: Triple, oldTriple: Triple) => {};

  publish = (signer: Signer, onChangePublishState: (newState: ReviewState) => void) => {};

  setQuery = (query: string) => {
    this.api.query$.next(query);
  };
}

// All of the triples we want to render
//  triples = Network Triples + Local Triples

//  networkTriples = Network Triples
//  localTriples = Local Triples
//  actions
//    Triple + Status
//    Action

// The original state of network triple that was changed locally
// The most recent state of a network triple that was changed locally
// The entity names of network triples that were changed locally, network triples, local triples
