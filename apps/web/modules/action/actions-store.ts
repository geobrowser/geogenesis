import { Observable, observable, computed } from '@legendapp/state';
import { Signer } from 'ethers';

import { Action } from '.';
import { INetwork } from '../services/network';
import {
  Action as ActionType,
  CreateTripleAction,
  DeleteTripleAction,
  EditTripleAction,
  ReviewState,
  Triple as TripleType,
} from '../types';
import { makeOptionalComputed } from '../utils';

interface IActionsStore {
  restore(spaceActions: SpaceActions): void;
  create(triple: TripleType): void;
  update(triple: TripleType, oldTriple: TripleType): void;
  remove(triple: TripleType): void;
  actionIdsToDelete(spaceId: string, actionIds: Array<string>): void;
  publish(
    spaceId: string,
    signer: Signer,
    onChangePublishState: (newState: ReviewState) => void,
    unstagedChanges: Record<string, unknown>
  ): void;
  unstagedChanges?: Record<string, unknown>;
}

interface IActionsStoreConfig {
  api: INetwork;
}

export type SpaceId = string;
export type SpaceActions = Record<SpaceId, ActionType[]>;

export class ActionsStore implements IActionsStore {
  private api: INetwork;
  actions$: Observable<SpaceActions>;
  allActions$;
  allSpacesWithActions$;

  constructor({ api }: IActionsStoreConfig) {
    const actions = observable<SpaceActions>({});

    this.api = api;
    this.actions$ = actions;
    this.allActions$ = makeOptionalComputed(
      [],
      computed(() => Object.values(this.actions$.get()).flatMap(actions => actions) ?? [])
    );
    this.allSpacesWithActions$ = makeOptionalComputed(
      [],
      computed(() => Object.keys(this.actions$.get()).filter(spaceId => this.actions$.get()[spaceId].length > 0) ?? [])
    );
  }

  private addActions = (spaceId: string, actions: ActionType[]) => {
    const prevActions: SpaceActions = this.actions$.get() ?? {};

    const newActions: SpaceActions = {
      ...prevActions,
      [spaceId]: [...(prevActions[spaceId] ?? []), ...actions],
    };

    this.actions$.set(newActions);
  };

  restore = (spaceActions: SpaceActions) => {
    this.actions$.set(spaceActions);
  };

  actionIdsToDelete = (spaceId: string, actionIds: Array<string>) => {
    const prevActions: SpaceActions = this.actions$.get() ?? {};

    const newActions: SpaceActions = {
      ...prevActions,
      [spaceId]: [...(prevActions[spaceId] ?? [])].filter((item: ActionType) => !actionIds.includes(getId(item))),
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

  clear = (spaceId: string) => {
    this.actions$.set({
      ...this.actions$.get(),
      [spaceId]: [],
    });
  };

  publish = async (
    spaceId: string,
    signer: Signer,
    onChangePublishState: (newState: ReviewState) => void,
    unstagedChanges: Record<string, unknown>
  ) => {
    const spaceActions: ActionType[] = this.actions$.get()[spaceId];
    const actionsToPublish = spaceActions.filter(action => !(getId(action) in unstagedChanges));

    if (actionsToPublish.length < 1) return;

    try {
      await this.api.publish({
        actions: Action.unpublishedChanges(Action.squashChanges(actionsToPublish)),
        signer,
        onChangePublishState,
        space: spaceId,
      });
    } catch (e) {
      console.error(e);
      onChangePublishState('idle');
      return;
    }

    const publishedActions = actionsToPublish.map(action => ({
      ...action,
      hasBeenPublished: true,
    }));
    const unstagedActions = spaceActions.filter(action => getId(action) in unstagedChanges);

    this.actions$.set({
      ...this.actions$.get(),
      [spaceId]: [...publishedActions, ...unstagedActions],
    });

    onChangePublishState('publish-complete');
    await new Promise(() => setTimeout(() => onChangePublishState('idle'), 3000)); // want to show the "complete" state for 3s
  };
}

const getId = (action: ActionType) => {
  switch (action.type) {
    case 'createTriple':
    case 'deleteTriple':
      return action.id;
    case 'editTriple':
      return action.before.id;
  }
};
