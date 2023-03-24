import { useSelector } from '@legendapp/state/react';

import { useActionsStoreContext } from './actions-store-provider';

/**
 * Hook to consume state/effects from the global ActionsStore.
 *
 * spaceId may be undefined if you are not currently viewing a space, i.e., you're
 * on a dev route or the root /spaces page.
 */
export function useActionsStore(spaceId?: string) {
  const {
    actions$,
    allActions$,
    allSpacesWithActions$,
    restore,
    publish,
    clear,
    create,
    update,
    remove,
    deleteActions,
  } = useActionsStoreContext();
  const actions = useSelector(actions$);
  const allActions = useSelector(allActions$);
  const allSpacesWithActions = useSelector(allSpacesWithActions$);

  if (!spaceId) {
    return {
      actions,
      actionsFromSpace: [],
      allActions,
      allSpacesWithActions,
      restore,
      publish,
      clear,
      create,
      update,
      remove,
      deleteActions,
    };
  }

  return {
    actions,
    actionsFromSpace: actions[spaceId] ?? [],
    allActions,
    allSpacesWithActions,
    restore,
    publish,
    clear,
    create,
    update,
    remove,
    deleteActions,
  };
}
