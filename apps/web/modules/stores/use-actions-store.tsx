import { useSelector } from '@legendapp/state/react';
import { useActionsStore } from './actions-store-provider';

export function useActions(spaceId: string) {
  const { actions$, publish } = useActionsStore();
  const actions = useSelector(actions$);

  return {
    actions: actions[spaceId] ?? [],
    publish,
  };
}
