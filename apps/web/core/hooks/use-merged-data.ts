import * as React from 'react';

import { Merged } from '../merged';
import { queryClient } from '../query-client';
import { Services } from '../services';
import { useActionsStore } from './use-actions-store';

export function useMergedData() {
  const store = useActionsStore();
  const { subgraph } = Services.useServices();

  return React.useMemo(
    () =>
      new Merged({
        store,
        subgraph,
        cache: queryClient,
      }),
    [store, subgraph]
  );
}
