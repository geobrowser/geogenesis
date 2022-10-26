import { CreateTripleAction, DeleteTripleAction } from '@geogenesis/action-schema';
import { computed, observable, Observable, ObservableComputed, observe } from '@legendapp/state';
import { Signer } from 'ethers';
import { createTripleWithId } from '../services/create-id';
import { INetwork } from '../services/network';
import { EntityNames, ReviewState, Triple } from '../types';
import { makeOptionalComputed } from '../utils';

interface ITripleStore {
  actions$: Observable<Action[]>;
  entityNames$: ObservableComputed<EntityNames>;
  triples$: ObservableComputed<Triple[]>;
  pageNumber$: Observable<number>;
  query$: Observable<string>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  create(triples: Triple[]): void;
  update(triple: Triple, oldTriple: Triple): void;
  publish(signer: Signer, onChangePublishState: (newState: ReviewState) => void): void;
  setQuery(query: string): void;
  setPageNumber(page: number): void;
}

interface ITripleStoreConfig {
  api: INetwork;
  space: string;
  initialParams: {
    query: string;
    pageNumber: number;
  };
  pageSize?: number;
}

type EditTripleAction = {
  type: 'editTriple';
  before: DeleteTripleAction;
  after: CreateTripleAction;
};

export type Action = CreateTripleAction | DeleteTripleAction | EditTripleAction;

const DEFAULT_PAGE_SIZE = 100;

export class TripleStore implements ITripleStore {
  private api: INetwork;
  actions$: Observable<Action[]> = observable<Action[]>([]);
  entityNames$: ObservableComputed<EntityNames> = observable<EntityNames>({});
  triples$: ObservableComputed<Triple[]> = observable([]);
  pageNumber$: Observable<number>;
  query$: Observable<string>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  space: string;

  constructor({ api, space, initialParams, pageSize = DEFAULT_PAGE_SIZE }: ITripleStoreConfig) {
    this.api = api;
    this.query$ = observable(initialParams.query);
    this.pageNumber$ = observable(initialParams.pageNumber);
    this.space = space;

    const networkData$ = makeOptionalComputed(
      { triples: [], entityNames: {}, hasNextPage: false },
      computed(async () => {
        try {
          const { triples, entityNames } = await this.api.fetchTriples({
            query: this.query$.get(),
            space: this.space,
            skip: this.pageNumber$.get() * pageSize,
            first: pageSize + 1,
          });

          return { triples: triples.slice(0, pageSize), entityNames, hasNextPage: triples.length > pageSize };
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            return new Promise(() => {});
          }

          // TODO: Real error handling

          return { triples: [], entityNames: {}, hasNextPage: false };
        }
      })
    );

    this.hasPreviousPage$ = computed(() => this.pageNumber$.get() > 0);
    this.hasNextPage$ = computed(() => networkData$.get().hasNextPage);

    this.triples$ = computed(() => {
      const { triples: networkTriples } = networkData$.get();

      // We operate on the triples array in reverse so that we can `push` instead of `unshift`
      // when creating new triples, which is significantly faster.
      const triples: Triple[] = [...networkTriples].reverse();

      // If our actions have modified one of the network triples, we don't want to add that
      // network triple to the triples array
      this.actions$.get().forEach(action => {
        switch (action.type) {
          case 'createTriple':
            triples.push(createTripleWithId({ ...action, space: 's' }));
            break;
          case 'deleteTriple': {
            const index = triples.findIndex(t => t.id === createTripleWithId({ ...action, space: 's' }).id);
            triples.splice(index, 1);
            break;
          }
          case 'editTriple': {
            const index = triples.findIndex(t => t.id === createTripleWithId({ ...action.before, space: 's' }).id);
            triples[index] = createTripleWithId({ ...action.after, space: 's' });
            break;
          }
        }
      });

      return triples.reverse();
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
    await this.api.publish({ actions: this.actions$.get(), signer, onChangePublishState, space: this.space });
    await this.setQuery('');
    this.actions$.set([]);
  };

  setQuery = (query: string) => {
    console.log('New query', query);
    this.setPageNumber(0);
    this.query$.set(query);
  };

  setPageNumber = (pageNumber: number) => {
    this.pageNumber$.set(pageNumber);
  };

  setNextPage = () => {
    // TODO: Bounds to the last page number
    this.pageNumber$.set(this.pageNumber$.get() + 1);
  };

  setPreviousPage = () => {
    const previousPageNumber = this.pageNumber$.get() - 1;
    if (previousPageNumber < 0) return;
    this.pageNumber$.set(previousPageNumber);
  };

  setRouter = (routeConfig: RouterConfig) => {
    this.router = routeConfig;
  };
}
