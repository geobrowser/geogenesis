import { Observable, observable } from '@legendapp/state';
import { Signer } from 'ethers';
import { INetwork } from '../services/network';
import {
  Action,
  CreateTripleAction,
  DeleteTripleAction,
  EditTripleAction,
  ReviewState,
  ITriple as TripleType,
} from '../types';

interface IActionsStore {
  create(triple: TripleType): void;
  update(triple: TripleType, oldTriple: TripleType): void;
  remove(triple: TripleType): void;
  publish(spaceId: string, signer: Signer, onChangePublishState: (newState: ReviewState) => void): void;
}

interface IActionsStoreConfig {
  api: INetwork;
}

type SpaceId = string;
type SpaceActions = Record<SpaceId, Action[]>;

export class ActionsStore implements IActionsStore {
  private api: INetwork;
  actions$: Observable<SpaceActions>;

  constructor({ api }: IActionsStoreConfig) {
    this.api = api;
    this.actions$ = observable<SpaceActions>({});
  }

  private addActions = (spaceId: string, actions: Action[]) => {
    const prevActions: SpaceActions = this.actions$.get() ?? {};
    const newActions: SpaceActions = {
      ...prevActions,
      [spaceId]: [...(prevActions[spaceId] ?? []), ...actions],
    };

    this.actions$.set(newActions);
  };

  create = (triple: TripleType) => {
    const action: CreateTripleAction = {
      ...triple,
      type: 'createTriple',
    };

    this.addActions(triple.space, [action]);
  };

  remove = (triple: TripleType) => {
    const spaceId = triple.space;

    const actions: DeleteTripleAction = {
      ...triple,
      type: 'deleteTriple',
    };

    this.addActions(spaceId, [actions]);
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

    const spaceId = triple.space;

    this.addActions(spaceId, [action]);
  };

  publish = async (spaceId: string, signer: Signer, onChangePublishState: (newState: ReviewState) => void) => {
    const spaceActions: Action[] = this.actions$.get()[spaceId];
    if (!spaceActions) return;

    await this.api.publish({
      actions: spaceActions,
      signer,
      onChangePublishState,
      space: spaceId,
    });

    this.actions$.set({
      ...this.actions$.get(),
      [spaceId]: [],
    });
  };
}
