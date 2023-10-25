'use client';

import * as React from 'react';

import { setSecondarySubgraphAsMain } from '~/core/services/services';

interface Props {
  children: React.ReactNode;
  usePermissionlessSubgraph: boolean;
}

export function SpaceConfigProvider({ children, usePermissionlessSubgraph }: Props) {
  React.useEffect(() => {
    setSecondarySubgraphAsMain(usePermissionlessSubgraph);
  }, [usePermissionlessSubgraph]);

  return <>{children}</>;
}
