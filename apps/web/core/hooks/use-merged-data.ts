import * as React from 'react';

import { Merged } from '../merged';
import { queryClient } from '../query-client';
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
        cache: queryClient,
      }),
    [store, localStore, subgraph]
  );
}
