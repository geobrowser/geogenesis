import * as React from 'react';

import { Merged } from '../merged';
import { queryClient } from '../query-client';
import { Services } from '../services';

export function useMergedData() {
  const { subgraph } = Services.useServices();

  return React.useMemo(
    () =>
      new Merged({
        subgraph,
        cache: queryClient,
      }),
    [subgraph]
  );
}
