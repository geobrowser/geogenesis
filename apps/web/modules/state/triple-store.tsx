import { Signer } from 'ethers';
import { BehaviorSubject, combineLatest, map, Observable, switchMap, tap } from 'rxjs';
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

type EditTripleAction = {
  type: 'editTriple';
  before: DeleteTripleAction;
  after: CreateTripleAction;
};

export type Action = CreateTripleAction | DeleteTripleAction | EditTripleAction;

export class TripleStore implements ITripleStore {
  private api: INetwork;
  actions$: BehaviorSubject<Action[]> = new BehaviorSubject<Action[]>([]);
  entityNames$ = new BehaviorSubject<EntityNames>({});
  triples$: Observable<Triple[]>;

  constructor({ api }: ITripleStoreConfig) {
    this.api = api;

    const networkData$ = this.api.query$.pipe(switchMap(value => this.api.fetchTriples(value)));

    this.triples$ = combineLatest([this.actions$, networkData$]).pipe(
      map(([actions, { triples: networkTriples }]) => {
        const triples: Triple[] = [...networkTriples];

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

        return triples;
      })
    );

    // Name-related stuff
    combineLatest([this.actions$, networkData$])
      .pipe(
        map(([actions, { entityNames: networkEntityNames }]) => {
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

          return entityNames;
        })
      )
      .subscribe(this.entityNames$);
  }

  create = (triples: Triple[]) => {
    const actions: CreateTripleAction[] = triples.map(triple => ({
      ...triple,
      type: 'createTriple',
    }));

    this.actions$.next([...this.actions$.value, ...actions]);
  };

  update = (triple: Triple, oldTriple: Triple) => {
    // TODO: This currently doesn't work for triples whose entity, attribute, or value has
    // been replaced with the "name" value. Will be fixed once we do
    // https://linear.app/geobrowser/issue/GEO-58/we-are-overwriting-the-triple-properties-in-local-store-with-entity
    if (triple.id === oldTriple.id) return;

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

    this.actions$.next([...this.actions$.value, action]);
  };

  publish = async (signer: Signer, onChangePublishState: (newState: ReviewState) => void) => {
    await this.api.publish(this.actions$.value, signer, onChangePublishState);
    this.actions$.next([]);
  };

  setQuery = (query: string) => {
    this.api.query$.next(query);
  };

  get actions() {
    return this.actions$.value;
  }
}
