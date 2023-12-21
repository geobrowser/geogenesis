'use client';

import * as React from 'react';

import { useSecondarySubgraph } from '~/core/services/services';
import { isPermissionlessSpace } from '~/core/utils/utils';

interface Props {
  children: React.ReactNode;
  spaceId: string;
}

export function SpaceConfigProvider({ children, spaceId }: Props) {
  const setSecondarySubgraphAsMain = useSecondarySubgraph();

  React.useEffect(() => {
    const isPermissionless = isPermissionlessSpace(spaceId);
    setSecondarySubgraphAsMain(isPermissionless);
  }, [spaceId, setSecondarySubgraphAsMain]);

  return <>{children}</>;
}
