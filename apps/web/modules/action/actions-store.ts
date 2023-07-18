import { Observable, observable, computed } from '@legendapp/state';
import { Signer } from 'ethers';

import { Action } from '.';
import { NetworkData } from '~/modules/io';
import {
  Action as ActionType,
  CreateTripleAction,
  DeleteTripleAction,
  EditTripleAction,
  ReviewState,
  Triple as ITriple,
} from '../types';
import { makeOptionalComputed } from '../utils';
import { Triple } from '../triple';

interface IActionsStore {
  restore(spaceActions: SpaceActions): void;
  create(triple: ITriple): void;
  update(triple: ITriple, oldTriple: ITriple): void;
  remove(triple: ITriple): void;
  deleteActions(spaceId: string, actionIdsToDelete: Array<string>): void;
  publish(
    spaceId: string,
    signer: Signer,
    onChangePublishState: (newState: ReviewState) => void,
    unstagedChanges: Record<string, unknown>,
    name: string,
    description?: string
  ): void;
  unstagedChanges?: Record<string, unknown>;
}

interface IActionsStoreConfig {
  api: NetworkData.INetwork;
}

export type SpaceId = string;
export type SpaceActions = Record<SpaceId, ActionType[]>;

export type EntityId = string;
export type AttributeId = string;
export type EntityActions = Record<EntityId, Record<AttributeId, ITriple>>;

export class ActionsStore implements IActionsStore {
  private api: NetworkData.INetwork;
  actions$: Observable<SpaceActions>;
  allActions$;
  allSpacesWithActions$;
  actionsByEntityId$;

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
      computed(
        () =>
          Object.keys(this.actions$.get()).filter(
            spaceId => Action.unpublishedChanges(this.actions$.get()[spaceId]).length > 0
          ) ?? []
      )
    );

    this.actionsByEntityId$ = computed(() => {
      const actions = this.allActions$.get();

      return actions.reduce<EntityActions>((acc, action) => {
        const tripleFromAction = Triple.fromActions([action], [])[0];

        if (!tripleFromAction) return acc;

        switch (action.type) {
          case 'createTriple':
          case 'deleteTriple':
            acc[action.entityId] = {
              ...acc[action.entityId],
              [action.attributeId]: tripleFromAction,
            };

            return acc;

          case 'editTriple':
            acc[action.after.entityId] = {
              ...acc[action.after.entityId],
              [action.after.attributeId]: tripleFromAction,
            };

            return acc;
        }
      }, {});
    });
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

  deleteActions = (spaceId: string, actionIdsToDelete: Array<string>) => {
    const prevActions: SpaceActions = this.actions$.get() ?? {};

    const newActions: SpaceActions = {
      ...prevActions,
      [spaceId]: [...(prevActions[spaceId] ?? [])].filter(
        (item: ActionType) => !actionIdsToDelete.includes(Action.getId(item))
      ),
    };

    this.actions$.set(newActions);
  };

  create = (triple: ITriple) => {
    const action: CreateTripleAction = {
      ...triple,
      type: 'createTriple',
    };

    this.addActions(triple.space, [action]);
  };

  remove = (triple: ITriple) => {
    const spaceId = triple.space;

    const actions: DeleteTripleAction = {
      ...triple,
      type: 'deleteTriple',
    };

    this.addActions(spaceId, [actions]);
  };

  update = (triple: ITriple, oldTriple: ITriple) => {
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

  clear = (spaceId?: string) => {
    if (!spaceId) {
      this.actions$.set({});
      return;
    }

    this.actions$.set({
      ...this.actions$.get(),
      [spaceId]: [],
    });
  };

  publish = async (
    spaceId: string,
    signer: Signer,
    onChangePublishState: (newState: ReviewState) => void,
    unstagedChanges: Record<string, unknown>,
    name: string,
    description: string | undefined = undefined
  ) => {
    const spaceActions: ActionType[] = this.actions$.get()[spaceId];
    const [actionsToPublish, actionsToPersist] = splitActions(spaceActions, unstagedChanges);

    if (actionsToPublish.length < 1) return;

    try {
      await this.api.publish({
        actions: Action.prepareActionsForPublishing(actionsToPublish),
        signer,
        onChangePublishState,
        space: spaceId,
        name,
        description,
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

    this.actions$.set({
      ...this.actions$.get(),
      [spaceId]: [...publishedActions, ...actionsToPersist],
    });

    onChangePublishState('publish-complete');
    await new Promise(() => setTimeout(() => onChangePublishState('idle'), 3000)); // want to show the "complete" state for 3s
  };
}

const splitActions = (actions: ActionType[], unstagedChanges: any) => {
  const actionsToPublish: ActionType[] = [];
  const actionsToPersist: ActionType[] = [];

  actions.forEach(action => {
    switch (action.type) {
      case 'createTriple':
      case 'deleteTriple':
        if (Object.hasOwn(unstagedChanges?.[action.entityId] ?? {}, action.attributeId)) {
          actionsToPersist.push(action);
        } else {
          actionsToPublish.push(action);
        }
        break;
      case 'editTriple':
        if (Object.hasOwn(unstagedChanges?.[action.before.entityId] ?? {}, action.before.attributeId)) {
          actionsToPersist.push(action);
        } else {
          actionsToPublish.push(action);
        }
        break;
    }
  });

  return [actionsToPublish, actionsToPersist];
};
