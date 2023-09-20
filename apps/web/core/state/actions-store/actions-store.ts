import { Observable, computed, observable } from '@legendapp/state';
import { configureObservablePersistence, persistObservable } from '@legendapp/state/persist';
import { ObservablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb';

import { Storage } from '~/core/io';
import {
  Action as ActionType,
  CreateTripleAction,
  DeleteTripleAction,
  EditTripleAction,
  Triple as ITriple,
} from '~/core/types';
import { Action } from '~/core/utils/action';
import { Triple } from '~/core/utils/triple';
import { makeOptionalComputed } from '~/core/utils/utils';

configureObservablePersistence({
  persistLocal: ObservablePersistIndexedDB,
  persistLocalOptions: {
    indexedDB: {
      databaseName: 'Legend',
      version: 1,
      tableNames: ['actionsStore'],
    },
  },
});

interface IActionsStore {
  restore(spaceActions: SpaceActions): void;
  addActionsToSpaces(spaceActionss: SpaceActions): void;
  create(triple: ITriple): void;
  update(triple: ITriple, oldTriple: ITriple): void;
  remove(triple: ITriple): void;
  deleteActions(spaceId: string, actionIdsToDelete: Array<string>): void;
}

interface IActionsStoreConfig {
  storageClient: Storage.IStorageClient;
}

export type SpaceId = string;
export type SpaceActions = Record<SpaceId, ActionType[]>;

export type EntityId = string;
export type AttributeId = string;
export type EntityActions = Record<EntityId, Record<AttributeId, ITriple>>;

export class ActionsStore implements IActionsStore {
  private storageClient: Storage.IStorageClient;
  actions$: Observable<SpaceActions>;
  allActions$;
  allSpacesWithActions$;
  actionsByEntityId$;

  constructor({ storageClient }: IActionsStoreConfig) {
    const actions = observable<SpaceActions>({});

    // `persistObservable` can be used to automatically persist an observable, both locally and
    // remotely; it will be saved whenever you change anything anywhere within the observable, and
    // the observable will be filled with the local state right after calling persistObservable
    // https://legendapp.com/open-source/state/persistence/#persistobservable
    if (typeof window !== 'undefined') {
      persistObservable(actions, {
        local: 'actionsStore',
      });
    }

    this.storageClient = storageClient;
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

  addActions = (spaceId: string, actions: ActionType[]) => {
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

  addActionsToSpaces = (spaceActions: SpaceActions) => {
    const prevActions: SpaceActions = this.actions$.get() ?? {};

    const newActions: SpaceActions = {};

    for (const [spaceId, actions] of Object.entries(spaceActions)) {
      newActions[spaceId] = [...(prevActions[spaceId] ?? []), ...actions];
    }

    this.actions$.set(newActions);
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
}
