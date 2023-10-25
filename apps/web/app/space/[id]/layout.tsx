import * as React from 'react';

import { API } from '~/core/io';

import { SpaceConfigProvider } from './space-config-provider';

interface Props {
  params: { id: string };
  children: React.ReactNode;
}

export default async function Layout({ children, params }: Props) {
  const { isPermissionlessSpace } = await API.space(params.id);

  return <SpaceConfigProvider usePermissionlessSubgraph={isPermissionlessSpace}>{children}</SpaceConfigProvider>;
}
