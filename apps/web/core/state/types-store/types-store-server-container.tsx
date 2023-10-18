import * as React from 'react';

import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';

import { TypesStoreProvider } from './types-store';

interface Props {
  spaceId: string;
  children: React.ReactNode;
}

export async function TypesStoreServerContainer({ spaceId, children }: Props) {
  let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: spaceId });
  let usePermissionlessSubgraph = false;

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: spaceId });
    if (space) usePermissionlessSubgraph = true;
  }

  if (usePermissionlessSubgraph) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  console.time('TypesStoreServerContainer: Fetch types');

  const [types, foreignTypes] = await Promise.all([
    fetchSpaceTypeTriples(Subgraph.fetchTriples, spaceId, config.subgraph),
    space ? fetchForeignTypeTriples(Subgraph.fetchTriples, space, config.subgraph) : [],
  ]);

  return (
    <TypesStoreProvider space={space} initialTypes={[...types, ...foreignTypes]}>
      {children}
    </TypesStoreProvider>
  );
}
