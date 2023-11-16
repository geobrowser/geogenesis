import { configureObservablePersistence, persistObservable } from '@legendapp/state/persist';
import { ObservablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb';
import { atom, useAtom } from 'jotai';

import * as React from 'react';

import { ID } from '~/core/id';
import {
  Action as ActionType,
  CreateTripleAction,
  DeleteTripleAction,
  EditTripleAction,
  Triple as ITriple,
} from '~/core/types';
import { Action } from '~/core/utils/action';
import { Triple } from '~/core/utils/triple';

import { store } from '../jotai-provider';
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

export type SpaceId = string;
export type SpaceActions = Record<SpaceId, ActionType[]>;

export type EntityId = string;
export type AttributeId = string;
export type EntityActions = Record<EntityId, Record<AttributeId, ITriple>>;

const atomWithAsyncStorage = (initialValue: ActionType[] = []) => {
  const baseAtom = atom<ActionType[]>(initialValue);

  baseAtom.onMount = setValue => {
    (async () => {
      const storedActions = await new Geo().actions.toArray();
      setValue(storedActions);
    })();
  };

  return baseAtom;
};

const actionsAtom = atomWithAsyncStorage();

const create = (triple: ITriple) => {
  const action: CreateTripleAction = {
    ...triple,
    type: 'createTriple',
  };

  const allActions = store.get(actionsAtom);
  console.log('creating', { action, allActions });
  store.set(actionsAtom, [...allActions, action]);
};

const remove = (triple: ITriple) => {
  const action: DeleteTripleAction = {
    ...triple,
    type: 'deleteTriple',
  };

  const allActions = store.get(actionsAtom);
  console.log('deleting', { action, allActions });
  store.set(actionsAtom, [...allActions, action]);
};

const update = (triple: ITriple, oldTriple: ITriple) => {
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

  const allActions = store.get(actionsAtom);
  console.log('updating', { action, allActions });
  store.set(actionsAtom, [...allActions, action]);
};

const unsub = store.sub(actionsAtom, async () => {
  const newActions = store.get(actionsAtom);
  console.log('newActions', newActions);

  await new Geo().actions.clear();
  new Geo().actions.bulkPut(Action.prepareActionsForPublishing(newActions));
});

// @TODO: Make a reducer atom so we know what operation we need to execute inside
// the write atom.
// const actionsAtomWithPersistence = atom(
//   get => get(actionsAtom),
//   async (_, set, actions) => {
//     console.log('actions in async writer', actions);

//     set(actionsAtom, actions as ActionType[]);
//     await new Geo().actions.bulkPut(actions as ActionType[]);
//   }
// );

export function useActions(spaceId?: string) {
  const [allActions, setActions] = useAtom(actionsAtom);

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

      const nonDeletedActions = allActions.filter(action => {
        switch (action.type) {
          case 'createTriple':
          case 'deleteTriple':
            return action.space !== spaceId;
          case 'editTriple':
            return action.after.space !== spaceId;
        }
      });

      console.log('clear', nonDeletedActions);
      setActions(nonDeletedActions);
    },
    [allActions, setActions]
  );

  const deleteActionsFromSpace = React.useCallback(
    (spaceId: string, actionIdsToDelete: Array<string>) => {
      const prevActions: SpaceActions = actions;
      const newActions: SpaceActions = {
        ...prevActions,
        [spaceId]: (prevActions[spaceId] ?? []).filter(
          (item: ActionType) => !actionIdsToDelete.includes(Action.getId(item))
        ),
      };

      const nonDeletedActions = allActions.filter(action => {
        switch (action.type) {
          case 'createTriple':
          case 'deleteTriple':
            return action.space !== spaceId && !actionIdsToDelete.includes(Action.getId(action));
          case 'editTriple':
            return action.after.space !== spaceId && !actionIdsToDelete.includes(Action.getId(action));
        }
      });

      console.log('deleteActionsFromSpace', nonDeletedActions);

      setActions(nonDeletedActions);
    },
    [setActions, allActions]
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
