import { useSelector } from '@legendapp/state/react';
import { useActionsStoreContext } from './actions-store-provider';

export function useActionsStore(spaceId?: string) {
  const { actions$, publish } = useActionsStoreContext();
  const actions = useSelector(actions$);

  if (!spaceId) {
    return {
      actions: [],
      publish,
    };
  }

  return {
    actions: actions[spaceId] ?? [],
    publish,
  };
}
