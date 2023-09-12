import * as React from 'react';

import { Merged } from '../merged';
import { Services } from '../services';
import { useActionsStoreInstance } from '../state/actions-store';
import { useLocalStoreInstance } from '../state/local-store';

export function useMergedData() {
  const store = useActionsStoreInstance();
  const localStore = useLocalStoreInstance();
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
