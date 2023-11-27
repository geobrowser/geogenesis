'use client';

import * as React from 'react';

import { useSecondarySubgraph } from '~/core/services/services';

interface Props {
  children: React.ReactNode;
  usePermissionlessSubgraph: boolean;
}

export function SpaceConfigProvider({ children, usePermissionlessSubgraph }: Props) {
  const setSecondarySubgraphAsMain = useSecondarySubgraph();

  React.useEffect(() => {
    setSecondarySubgraphAsMain(usePermissionlessSubgraph);
  }, [usePermissionlessSubgraph, setSecondarySubgraphAsMain]);

  return <>{children}</>;
}
