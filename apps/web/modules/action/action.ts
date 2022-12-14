import { Action, Action as ActionType } from '~/modules/types';

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
  const changeCount = Object.values(firstAndLastActions).reduce((acc, [first, last]) => {
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
  const allIds = new Set(
    actions.flatMap(a => {
      switch (a.type) {
        case 'createTriple':
        case 'deleteTriple':
          return a.id;
        case 'editTriple':
          return [a.before.id, a.after.id];
      }
    })
  );

  const reverseActions = actions.slice().reverse();

  // For each id, we need to find it's first instance and it's last instance. These might
  // be the same action, which is okay.
  return [...allIds].reduce<Record<string, [ActionType, ActionType]>>((acc, id) => {
    const firstAction = actions.filter(a => {
      switch (a.type) {
        case 'createTriple':
        case 'deleteTriple':
          return a.id === id;
        case 'editTriple':
          return a.before.id === id;
      }
    });

    const lastAction = reverseActions.filter(a => {
      switch (a.type) {
        case 'createTriple':
        case 'deleteTriple':
          return a.id === id;
        case 'editTriple':
          return a.after.id === id;
      }
    });

    acc[id] = [firstAction[0], lastAction[0]];
    return acc;
  }, {});
}

/**
 * Reduce the number of local actions only to the necessary before/after actions. This reduces
 * IPFS upload time for large edits and indexer time for the subgraph.
 *
 * For most actions we can just return the "After" action since that's all the subgraph needs
 * to update the triple.
 */
export function squashChanges(actions: Action[]) {
  return Object.values(getFirstAndLastChanges(actions))
    .map(changeTuple => {
      // In this case we're fine just returning the after action since it will include
      // the final state of the triple.
      if (changeTuple[0].type === 'createTriple' && changeTuple[1].type === 'editTriple') {
        return changeTuple[1].after;
      }

      // This doesn't need to go to the subgraph at all.
      if (changeTuple[0].type === 'createTriple' && changeTuple[1].type === 'deleteTriple') {
        return null;
      }

      return changeTuple[1];
    })
    .flatMap(changeTuple => (changeTuple ? changeTuple : []));
}

export function unpublishedChanges(actions: Action[]) {
  return actions.filter(a => !a.hasBeenPublished);
}
