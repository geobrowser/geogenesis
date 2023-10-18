import * as React from 'react';

import { API } from '~/core/io';

import { SpaceConfigProvider } from './space-config-provider';

interface Props {
  params: { id: string };
  children: React.ReactNode;
}

export default async function Layout({ children, params }: Props) {
  console.log('-----------------------------------------------------------------------');
  console.log('PROFILING SPACE DATA LOADING FOR ' + params.id);

  console.time('Layout: Fetching space');
  const { isPermissionlessSpace } = await API.space(params.id);
  console.timeEnd('Layout: Fetching space');

  return <SpaceConfigProvider usePermissionlessSubgraph={isPermissionlessSpace}>{children}</SpaceConfigProvider>;
}
