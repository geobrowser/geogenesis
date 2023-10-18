import * as React from 'react';

import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';

import { SpaceConfigProvider } from './space-config-provider';

interface Props {
  params: { id: string };
  children: React.ReactNode;
}

export default async function Layout({ children, params }: Props) {
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: params.id });
  let usePermissionlessSubgraph = false;

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: params.id });
    if (space) usePermissionlessSubgraph = true;
  }

  return <SpaceConfigProvider usePermissionlessSubgraph={usePermissionlessSubgraph}>{children}</SpaceConfigProvider>;
}
