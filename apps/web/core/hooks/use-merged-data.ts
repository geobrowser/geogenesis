import * as React from 'react';

import { Merged } from '../merged';
import { Services } from '../services';
import { useLocalStore } from '../state/local-store';
import { useActionsStore } from './use-actions-store';

export function useMergedData() {
  const store = useActionsStore();
  const localStore = useLocalStore();
  const { subgraph } = Services.useServices();

  return React.useMemo(
    () =>
      new Merged({
        store,
        localStore,
        subgraph,
      }),
    [store, localStore, subgraph]
  );
}
