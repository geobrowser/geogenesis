import { Action as ActionType } from '~/modules/types';

// For each id we find, we need to traverse the list to find the first and last actions associated with that id
// Then we need to check the first and last actions and compare to see if they've changed.
function getChangeCount(actions: ActionType[]) {
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

  // For each id, we need to find it's first instance and it's last instance
  const firstAndLastActions = [...allIds].reduce<Record<string, [ActionType | undefined, ActionType | undefined]>>(
    (acc, id) => {
      const firstAction = actions.find(a => {
        switch (a.type) {
          case 'createTriple':
          case 'deleteTriple':
            return a.id === id;
          case 'editTriple':
            return a.before.id === id;
        }
      });

      const lastAction = reverseActions.find(a => {
        switch (a.type) {
          case 'createTriple':
          case 'deleteTriple':
            return a.id === id;
          case 'editTriple':
            return a.after.id === id;
        }
      });

      acc[id] = [firstAction, lastAction];
      return acc;
    },
    {}
  );

  // Check that the first and last actions are different
  const changes = Object.values(firstAndLastActions).reduce((acc, [first, last]) => {
    // Check all combinations of different action types that could result in different
    // values within the same field
    if (first?.type === 'editTriple' && last?.type === 'editTriple') {
      if (first.before.value.type === 'entity' && last.after.value.type === 'entity') {
        return acc + (first.before.value.id !== last.after.value.id ? 1 : 0);
      } else if (first.before.value.type === 'string' && last.after.value.type === 'string') {
        // console.log('edit-to-edit for string');
        // console.log('before', first.before.value.value);
        // console.log('after', last.after.value.value);
        return acc + (first.before.value.value !== last.after.value.value ? 1 : 0);
      }

      return acc + 1;
    }

    if (first?.type === 'deleteTriple' && last?.type === 'createTriple') {
      return acc + 1;
    }

    if (first?.type === 'createTriple' && last?.type === 'editTriple') {
      return acc + 1;
    }

    if (first?.type === 'editTriple' && last?.type === 'createTriple') {
      return acc + 1;
    }

    if (first?.type === 'createTriple' && last?.type === 'deleteTriple') {
      return acc;
    }

    if (first?.type === 'createTriple' && last?.type === 'createTriple') {
      return acc + 1;
    }

    if (first?.type === 'deleteTriple' && last?.type === 'deleteTriple') {
      return acc + 1;
    }

    return acc + 1;
  }, 0);

  return changes;
}

export const Action = {
  getChangeCount,
};
