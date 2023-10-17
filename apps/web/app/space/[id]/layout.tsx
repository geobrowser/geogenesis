import { cookies } from 'next/headers';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';

import { SpaceConfigProvider } from './space-config-provider';

interface Props {
  params: { id: string };
  children: React.ReactNode;
}

export default async function Layout({ children, params }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;

  // Layouts don't get search params (hmm)
  const config = Params.getConfigFromParams({}, env);

  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: params.id });
  let usePermissionlessSubgraph = false;

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: params.id });
    if (space) usePermissionlessSubgraph = true;
  }

  return <SpaceConfigProvider usePermissionlessSubgraph={usePermissionlessSubgraph}>{children}</SpaceConfigProvider>;
}
