import { useSelector } from '@legendapp/state/react';
import { useActionsStoreContext } from './actions-store-provider';

/**
 * Hook to consume state/effects from the global ActionsStore.
 *
 * spaceId may be undefined if you are not currently viewing a space, i.e., you're
 * on a dev route or the root /spaces page.
 */
export function useActionsStore(spaceId?: string) {
  const { actions$, publish, clear } = useActionsStoreContext();
  const actions = useSelector(actions$);

  if (!spaceId) {
    return {
      actions: [],
      publish,
      clear,
    };
  }

  return {
    actions: actions[spaceId] ?? [],
    publish,
    clear,
  };
}
