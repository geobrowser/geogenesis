import { Signer } from 'ethers';
import { observable, Observable, computed, ObservableComputed } from '@legendapp/state';
import { CreateTripleAction, DeleteTripleAction } from '@geogenesis/action-schema';
import { INetwork } from '../services/network';
import { EntityNames, ReviewState, Triple } from '../types';
import { createTripleWithId } from '../services/create-id';

interface ITripleStore {
  actions$: Observable<Action[]>;
  entityNames$: ObservableComputed<EntityNames>;
  triples$: ObservableComputed<Triple[]>;
  create(triples: Triple[]): void;
  update(triple: Triple, oldTriple: Triple): void;
  publish(signer: Signer, onChangePublishState: (newState: ReviewState) => void): void;
  setQuery(query: string): void;
  setPageNumber(page: number): void;
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

function makeOptionalComputed<T>(initialValue: T, observable: ObservableComputed<T>): ObservableComputed<T> {
  return computed(() => {
    const data = observable.get() as T;
    if (data === undefined) return initialValue;
    return data;
  });
}

const PAGE_SIZE = 100;

export class TripleStore implements ITripleStore {
  private api: INetwork;
  actions$: Observable<Action[]> = observable<Action[]>([]);
  entityNames$: ObservableComputed<EntityNames> = observable<EntityNames>({});
  triples$: ObservableComputed<Triple[]> = observable([]);

  constructor({ api }: ITripleStoreConfig) {
    this.api = api;

    const networkData$ = makeOptionalComputed(
      { triples: [], entityNames: {} },
      computed(async () => {
        try {
          return await this.api.fetchTriples(this.api.query$.get(), this.api.pageNumber$.get() * PAGE_SIZE, PAGE_SIZE);
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            console.log(e);
            return new Promise(() => {});
          }

          return { triples: [], entityNames: {} };
        }
      })
    );

    this.triples$ = computed(() => {
      const { triples: networkTriples } = networkData$.get();
      const triples: Triple[] = [...networkTriples];

      // If our actions have modified one of the network triples, we don't want to add that
      // network triple to the triples array
      this.actions$.get().forEach(action => {
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
    });

    this.entityNames$ = computed(() => {
      const { entityNames: networkEntityNames } = networkData$.get();
      const entityNames = this.actions$.get().reduce(
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

    this.actions$.set([...this.actions$.get(), action]);
  };

  publish = async (signer: Signer, onChangePublishState: (newState: ReviewState) => void) => {
    await this.api.publish(this.actions$.get(), signer, onChangePublishState);
    await this.setQuery('');
    this.actions$.set([]);
  };

  setQuery = (query: string) => {
    this.setPageNumber(0);
    this.api.query$.set(query);
  };

  setPageNumber = (pageNumber: number) => {
    this.api.pageNumber$.set(pageNumber);
  };
}
