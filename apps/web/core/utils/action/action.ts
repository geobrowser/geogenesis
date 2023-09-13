import { SYSTEM_IDS } from '@geogenesis/ids';
import { pipe } from '@mobily/ts-belt';

import { Action, Action as ActionType } from '~/core/types';

export function forEntityId(actions: ActionType[], entityId: string) {
  return actions.filter(a => {
    switch (a.type) {
      case 'createTriple':
      case 'deleteTriple':
        return a.entityId === entityId;
      case 'editTriple':
        return a.before.entityId === entityId || a.after.entityId === entityId;
    }
  });
}

// For each id we find, we need to traverse the list to find the first and last actions associated with that id
// Then we need to check the first and last actions and compare to see if they've changed.
export function getChangeCount(actions: ActionType[]) {
  const firstAndLastActions = getFirstAndLastChanges(actions);

  /**
   * We aggregate the number of changes based on the type of [firstAction, lastAction] combination. There are a
   * handful of combinations of [firstAction, lastAction] types for a given triple id.
   * 1. createTriple, createTriple -- This should only be considered one change
   * 2. createTriple, editTriple -- This should only be considered one change
   * 3. createTriple, deleteTriple -- This should be considered no change
   * 4. editTriple, editTriple -- This should be considered one change only if the value has changed
   * 5. editTriple, deleteTriple -- This should be considered one change
   *
   * You'll notice we really only use the first action in the [editTriple, editTriple] case. This is because
   * we need to check the before and after values of the _first_ edit for a triple against the _last_ edit
   * for the same triple to verify the value has changed.
   **/
  const changeCount = firstAndLastActions.reduce((acc, { first, last }) => {
    if (first?.type === 'editTriple' && last?.type === 'editTriple') {
      if (first.before.value.type === 'entity' && last.after.value.type === 'entity') {
        return acc + (first.before.value.id !== last.after.value.id ? 1 : 0);
      } else if (first.before.value.type === 'string' && last.after.value.type === 'string') {
        return acc + (first.before.value.value !== last.after.value.value ? 1 : 0);
      }

      return acc + 1;
    }

    if (first?.type === 'createTriple' && last?.type === 'deleteTriple') {
      return acc;
    }

    return acc + 1;
  }, 0);

  return changeCount;
}

function getFirstAndLastChanges(actions: ActionType[]) {
  const visited: Record<string, { first: ActionType; last: ActionType }> = {};

  // Traverse the list of arrays forwards and backwards to find the first and last actions
  // for each triple id.
  //
  // Any updated triples (type: editTriple) should have the same id. We might get the same
  // action for the first and last action, but that's fine and we can handle that later
  // when aggregating the counts.
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];

    switch (action.type) {
      case 'createTriple':
      case 'deleteTriple':
        if (action.id in visited) {
          if (!visited[action.id].first) {
            visited[action.id].first = action;
          }
        } else {
          visited[action.id] = {
            first: action,
            last: action,
          };
        }
        break;
      case 'editTriple':
        if (action.before.id in visited) {
          if (!visited[action.before.id].first) {
            visited[action.before.id].first = action;
          }
        } else {
          visited[action.before.id] = {
            first: action,
            last: action,
          };
        }
        break;
    }
  }

  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];

    // We have already visited every action, so we don't need an
    // `else` clause in the below switch statement.
    switch (action.type) {
      case 'createTriple':
      case 'deleteTriple':
        if (action.id in visited) {
          if (!visited[action.id].last) {
            visited[action.id].last = action;
          }
        }
        break;
      case 'editTriple':
        if (action.after.id in visited) {
          if (!visited[action.after.id].last) {
            visited[action.after.id].last = action;
          }
        }
        break;
    }
  }

  return Object.values(visited);
}

/**
 * Reduce the number of local actions only to the necessary before/after actions. This reduces
 * IPFS upload time for large edits and indexer time for the subgraph.
 *
 * For most actions we can just return the "After" action since that's all the subgraph needs
 * to update the triple.
 */
export function squashChanges(actions: Action[]) {
  const result = Object.values(getFirstAndLastChanges(actions))
    .map(changeTuple => {
      // In this case we're fine just returning the after action since it will include
      // the final state of the triple.
      if (changeTuple.first.type === 'createTriple' && changeTuple.last.type === 'editTriple') {
        return changeTuple.last.after;
      }

      // This doesn't need to go to the subgraph at all.
      if (changeTuple.first.type === 'createTriple' && changeTuple.last.type === 'deleteTriple') {
        return null;
      }

      // Delete->Create where the previous triple is the same as the new triple
      if (changeTuple.first.type === 'deleteTriple' && changeTuple.last.type === 'createTriple') {
        if (
          changeTuple.first.value.type === changeTuple.last.value.type &&
          getValue(changeTuple.first) === getValue(changeTuple.last)
        ) {
          return null;
        }
      }

      // Edit -> Edit where the value types are the same and the before/after values are the same.
      // We don't need to send this to the subgraph.
      if (changeTuple.first.type === 'editTriple' && changeTuple.last.type === 'editTriple') {
        if (
          changeTuple.first.before.value.type === changeTuple.last.after.value.type &&
          getValue(changeTuple.first.before) === getValue(changeTuple.last.after)
        ) {
          return null;
        }
      }

      return changeTuple.last;
    })
    .flatMap(changeTuple => (changeTuple ? changeTuple : []));

  return result;
}

export function unpublishedChanges(actions: Action[]) {
  return actions.filter(a => !a.hasBeenPublished);
}

export function prepareActionsForPublishing(actions: Action[]) {
  return pipe(actions, unpublishedChanges, squashChanges);
}

export const getValue = (action: ActionType, fallback: boolean | string = false): string => {
  const checkedAction = action.type === 'editTriple' ? action.after : action;
  let value: string | null = '';

  switch (checkedAction.value.type) {
    case 'entity':
      value = checkedAction.value.id;
      break;
    case 'string':
    case 'number':
    case 'image':
    case 'date':
    case 'url':
      value = checkedAction.value.value;
      break;
  }

  return fallback !== false ? value ?? fallback : value;
};

export const getValueType = (action: Action) => {
  const checkedAction = action.type === 'editTriple' ? action.after : action;

  return checkedAction.value.type;
};

export const getName = (action: Action) => {
  const checkedAction = action.type === 'editTriple' ? action.after : action;

  switch (checkedAction.value.type) {
    case 'entity':
      return checkedAction.value.name;
    default:
      return null;
  }
};

export const getId = (action: Action) => {
  switch (action.type) {
    case 'createTriple':
    case 'deleteTriple':
      return action.id;
    case 'editTriple':
      return action.before.id;
  }
};

export const getBlockType = (action: Action) => {
  const checkedAction = action.type === 'editTriple' ? action.after : action;

  switch (checkedAction.attributeId) {
    case SYSTEM_IDS.TEXT_BLOCK:
      return 'textBlock';
    case SYSTEM_IDS.IMAGE:
    case SYSTEM_IDS.IMAGE_ATTRIBUTE:
    case SYSTEM_IDS.IMAGE_BLOCK:
      return 'imageBlock';
    case SYSTEM_IDS.TABLE_BLOCK:
      return 'tableBlock';
    case SYSTEM_IDS.MARKDOWN_CONTENT:
      return 'markdownContent';
    default:
      return null;
  }
};

export const splitActions = (actions: ActionType[], unstagedChanges: Record<string, Record<string, boolean>>) => {
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
