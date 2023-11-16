import { Observable, computed, observable } from '@legendapp/state';
import { configureObservablePersistence, persistObservable } from '@legendapp/state/persist';
import { ObservablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb';
import { atom, useAtom } from 'jotai';

import * as React from 'react';

import { ID } from '~/core/id';
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

import { Geo } from './indexeddb';

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

export type SpaceId = string;
export type SpaceActions = Record<SpaceId, ActionType[]>;

export type EntityId = string;
export type AttributeId = string;
export type EntityActions = Record<EntityId, Record<AttributeId, ITriple>>;

export class ActionsStore implements IActionsStore {
  actions$: Observable<SpaceActions>;
  allActions$;
  allSpacesWithActions$;
  actionsByEntityId$;

  constructor() {
    const actions = observable<SpaceActions>({});

    // `persistObservable` can be used to automatically persist an observable, both locally and
    // remotely; it will be saved whenever you change anything anywhere within the observable, and
    // the observable will be filled with the local state right after calling persistObservable
    // https://legendapp.com/open-source/state/persistence/#persistobservable
    if (typeof window !== 'undefined') {
      persistObservable(actions, {
        local: {
          name: 'actionsStore',
          adjustData: {
            save: (data: SpaceActions) => {
              const savedData: SpaceActions = {};

              Object.entries(data).forEach(([spaceId, actions]) => {
                const persistedActions = actions.filter(action => !action.hasBeenPublished);

                if (persistedActions.length > 0) {
                  savedData[spaceId] = persistedActions;
                }
              });

              return savedData;
            },
          },
        },
      });
    }

    this.actions$ = actions;

    this.allActions$ = makeOptionalComputed(
      [],
      computed(() => {
        return Object.values(this.actions$.get()).flatMap(actions => actions) ?? [];
      })
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

    const db = new Geo();

    db.actions.bulkAdd(actions).then(idk => {
      console.log('bulkAdd', idk);
    });

    db.actions.toArray().then(idk => {
      console.log('actions', idk);
    });

    this.actions$.set(newActions);
  };

  restore = (spaceActions: SpaceActions) => {
    new Geo().actions.bulkAdd(Object.values(spaceActions).flatMap(actions => actions));
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

    const db = new Geo();

    db.actions.clear().then(() => {
      db.actions.bulkAdd(Object.values(newActions).flatMap(actions => actions));
    });

    this.actions$.set(newActions);
  };

  create = (triple: ITriple) => {
    const action: CreateTripleAction = {
      ...triple,
      id: ID.createEntityId(),
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
      id: ID.createEntityId(),
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

const atomWithAsyncStorage = (initialValue: ActionType[] = []) => {
  const baseAtom = atom<ActionType[]>(initialValue);

  baseAtom.onMount = setValue => {
    (async () => {
      const storedActions = await new Geo().actions.toArray();
      setValue(storedActions);
    })();
  };

  // const persistAtom = atom<ActionType[]>(
  //   get => get(baseAtom),
  //   async (get, _, update) => {
  //     const nextValue: ActionType[] = typeof update === 'function' ? update(get(baseAtom)) : update;
  //     await new Geo().actions.bulkAdd(nextValue);
  //   }
  // );

  return baseAtom;
};

const actionsAtom = atomWithAsyncStorage();

export function useActions(spaceId?: string) {
  const [allActions, setActions] = useAtom(actionsAtom);

  const create = React.useCallback(
    (triple: ITriple) => {
      const action: CreateTripleAction = {
        ...triple,
        id: ID.createEntityId(),
        type: 'createTriple',
      };

      setActions([action]);
    },
    [setActions]
  );

  const remove = React.useCallback(
    (triple: ITriple) => {
      const actions: DeleteTripleAction = {
        ...triple,
        type: 'deleteTriple',
      };

      setActions([actions]);
    },
    [setActions]
  );

  const update = React.useCallback(
    (triple: ITriple, oldTriple: ITriple) => {
      const action: EditTripleAction = {
        id: ID.createEntityId(),
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

      setActions([action]);
    },
    [setActions]
  );

  const actions = React.useMemo(() => {
    const actions: SpaceActions = {};

    for (const action of allActions) {
      let spaceId: string | null = null;

      switch (action.type) {
        case 'createTriple':
        case 'deleteTriple':
          spaceId = action.space;
          break;
        case 'editTriple':
          spaceId = action.after.space;
          break;
      }

      if (!spaceId) continue;

      if (!actions[spaceId]) {
        actions[spaceId] = [];
      }

      actions[spaceId] = [...actions[spaceId], action];
    }

    return actions;
  }, [allActions]);

  const allSpacesWithActions = React.useMemo(() => {
    return Object.keys(actions);
  }, [actions]);

  const clear = React.useCallback(
    (spaceId?: string) => {
      if (!spaceId) {
        setActions([]);
        return;
      }

      setActions(
        allActions.filter(action => {
          switch (action.type) {
            case 'createTriple':
            case 'deleteTriple':
              return action.space !== spaceId;
            case 'editTriple':
              return action.after.space !== spaceId;
          }
        })
      );
    },
    [allActions, setActions]
  );

  const deleteActionsFromSpace = React.useCallback(
    (spaceId: string, actionIdsToDelete: Array<string>) => {
      const prevActions: SpaceActions = actions;

      const newActions: SpaceActions = {
        ...prevActions,
        [spaceId]: [...(prevActions[spaceId] ?? [])].filter(
          (item: ActionType) => !actionIdsToDelete.includes(Action.getId(item))
        ),
      };

      const newActionsAsArray = Object.values(newActions).flatMap(actions => actions);
      console.log('newActionsAsArray', newActionsAsArray);
      setActions(newActionsAsArray);
    },
    [setActions, actions]
  );

  const addActionsToSpaces = React.useCallback(
    (spaceActions: SpaceActions) => {
      const prevActions: SpaceActions = actions;

      const newActions: SpaceActions = {};

      for (const [spaceId, actions] of Object.entries(spaceActions)) {
        newActions[spaceId] = [...(prevActions[spaceId] ?? []), ...actions];
      }

      const newActionsAsArray = Object.values(newActions).flatMap(actions => actions);
      setActions(newActionsAsArray);
    },
    [setActions, actions]
  );

  // @TODO: What's the difference between restore and addActionsToSpaces?
  const restore = React.useCallback(
    (spaceActions: SpaceActions) => {
      const newActionsAsArray = Object.values(spaceActions).flatMap(actions => actions);

      setActions(newActionsAsArray);
    },
    [setActions]
  );

  const actionsByEntityId = React.useMemo(() => {
    return allActions.reduce<EntityActions>((acc, action) => {
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
  }, [allActions]);

  if (!spaceId) {
    return {
      allActions,
      allSpacesWithActions,
      actionsFromSpace: [],
      actionsByEntityId,
      actions,

      addActions: setActions,
      create,
      update,
      remove,
      clear,

      deleteActionsFromSpace,
      addActionsToSpaces,
      restore,
    };
  }

  return {
    allActions,
    allSpacesWithActions,
    actionsFromSpace: actions[spaceId] ?? [],
    actionsByEntityId,
    actions,

    addActions: setActions,
    create,
    update,
    remove,
    clear,

    deleteActionsFromSpace,
    addActionsToSpaces,
    restore,
  };
}
