import { useMemo } from 'react';
import { useSelector } from '@legendapp/state/react';

import { useActionsStoreContext } from './actions-store-provider';
import type { Action } from '../types';

/**
 * Hook to consume state/effects from the global ActionsStore.
 *
 * spaceId may be undefined if you are not currently viewing a space, i.e., you're
 * on a dev route or the root /spaces page.
 */
export function useActionsStore(spaceId?: string) {
  const { actions$, publish, clear, create, update, remove, deleteActions } = useActionsStoreContext();
  const actions = useSelector(actions$);
  const allActions: Array<Action> = useMemo(
    () => Object.entries(actions).flatMap(([, actions]) => actions) ?? [],
    [actions]
  );
  const allSpacesWithActions: Array<string> = useMemo(
    () => Object.keys(actions).filter(spaceId => actions[spaceId].length > 0) ?? [],
    [actions]
  );

  if (!spaceId) {
    return {
      actions: [],
      allActions,
      allSpacesWithActions,
      publish,
      clear,
      create,
      update,
      remove,
      deleteActions,
    };
  }

  return {
    actions: actions[spaceId] ?? [],
    allActions,
    allSpacesWithActions,
    publish,
    clear,
    create,
    update,
    remove,
    deleteActions,
  };
}
