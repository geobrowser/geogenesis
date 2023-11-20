import { atom, useAtom } from 'jotai';

import * as React from 'react';

import { ID } from '~/core/id';
import {
  Action as ActionType,
  CreateTripleAction,
  DeleteTripleAction,
  EditTripleAction,
  EntityActions,
  Triple as ITriple,
  SpaceActions,
} from '~/core/types';
import { Action } from '~/core/utils/action';
import { Triple } from '~/core/utils/triple';

import { store } from '../jotai-provider';
import { db, legacyDb } from './indexeddb';

const atomWithAsyncStorage = (initialValue: ActionType[] = []) => {
  const baseAtom = atom<ActionType[]>(initialValue);

  baseAtom.onMount = setValue => {
    (async () => {
      const storedActions = await db.actions.toArray();
      const legacyStoredActions = await legacyDb.actionsStore.toArray();

      if (legacyStoredActions.length > 0) {
        const actions: ActionType[] = [];

        for (let legacyActions of legacyStoredActions) {
          const allSpaceActions = Object.values(legacyActions).flatMap(action => action);

          for (let action of allSpaceActions) {
            actions.push(action);
          }
        }

        await legacyDb.actionsStore.clear();
        setValue(actions);
        return;
      }

      setValue(storedActions);
    })();
  };

  return baseAtom;
};

export const actionsAtom = atomWithAsyncStorage();

function getSpaceActions(allActions: ActionType[]) {
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
}

const create = (triple: ITriple) => {
  const action: CreateTripleAction = {
    ...triple,
    type: 'createTriple',
  };

  const allActions = store.get(actionsAtom);
  store.set(actionsAtom, [...allActions, action]);
};

const remove = (triple: ITriple) => {
  const action: DeleteTripleAction = {
    ...triple,
    type: 'deleteTriple',
  };

  const allActions = store.get(actionsAtom);
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
  store.set(actionsAtom, [...allActions, action]);
};

const restore = (spaceActions: SpaceActions) => {
  const newActionsAsArray = Object.values(spaceActions).flatMap(actions => actions);
  store.set(actionsAtom, newActionsAsArray);
};

const clear = (spaceId?: string) => {
  if (!spaceId) {
    store.set(actionsAtom, []);
    return;
  }

  const allActions = store.get(actionsAtom);

  const nonDeletedActions = allActions.filter(action => {
    switch (action.type) {
      case 'createTriple':
      case 'deleteTriple':
        return action.space !== spaceId;
      case 'editTriple':
        return action.after.space !== spaceId;
    }
  });

  store.set(actionsAtom, nonDeletedActions);
};

// @TODO: This is the same as restore
const addActionsToSpaces = (spaceActions: SpaceActions) => {
  const newActionsAsArray = Object.values(spaceActions).flatMap(actions => actions);
  store.set(actionsAtom, newActionsAsArray);
};

const deleteActionsFromSpace = (spaceId: string, actionIdsToDelete: Array<string>) => {
  const allActions = store.get(actionsAtom);

  const nonDeletedActions = allActions.filter(action => {
    switch (action.type) {
      case 'createTriple':
      case 'deleteTriple':
        return action.space !== spaceId && !actionIdsToDelete.includes(Action.getId(action));
      case 'editTriple':
        return action.after.space !== spaceId && !actionIdsToDelete.includes(Action.getId(action));
    }
  });

  store.set(actionsAtom, nonDeletedActions);
};

export function useActions(spaceId?: string) {
  const [allActions, setActions] = useAtom(actionsAtom);

  const actions = React.useMemo(() => {
    return getSpaceActions(allActions);
  }, [allActions]);

  const allSpacesWithActions = React.useMemo(() => {
    return Object.keys(actions);
  }, [actions]);

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
