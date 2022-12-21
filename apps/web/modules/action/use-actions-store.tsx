import { useSelector } from '@legendapp/state/react';
import { useActionsStoreContext } from './actions-store-provider';

export function useActions(spaceId: string) {
  const { actions$, publish } = useActionsStoreContext();
  const actions = useSelector(actions$);

  return {
    actions: actions[spaceId] ?? [],
    publish,
  };
}
