import { Observable, observable } from '@legendapp/state';
import { Signer } from 'ethers';
import { CreateTripleAction } from '~/../../packages/action-schema/dist/src';
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
  private readonly api: INetwork;
  private readonly spaceId: string;
  private readonly triples$: Observable<Triple[]>;
  private readonly entityNames$: Observable<EntityNames>;
  private readonly actions$: Observable<Action[]>;

  constructor({ api, initialEntityNames, initialTriples, spaceId }: IEntityStoreConfig) {
    this.api = api;
    this.triples$ = observable(initialTriples);
    this.entityNames$ = observable(initialEntityNames);
    this.actions$ = observable<Action[]>([]);
    this.spaceId = spaceId;
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

  get triples() {
    return this.triples$.get();
  }

  get entityNames() {
    return this.entityNames$.get();
  }
}
