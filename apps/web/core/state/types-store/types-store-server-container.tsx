import * as React from 'react';

import { Subgraph } from '~/core/io';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';

import { TypesStoreProvider } from './types-store';

interface Props {
  spaceId: string;
  endpoint: string;
  children: React.ReactNode;
}

export async function TypesStoreServerContainer({ spaceId, endpoint, children }: Props) {
  const space = await Subgraph.fetchSpace({ id: spaceId, endpoint });

  const [types, foreignTypes] = await Promise.all([
    fetchSpaceTypeTriples(Subgraph.fetchTriples, spaceId, endpoint),
    space ? fetchForeignTypeTriples(Subgraph.fetchTriples, space, endpoint) : [],
  ]);

  return (
    <TypesStoreProvider space={space} initialTypes={[...types, ...foreignTypes]}>
      {children}
    </TypesStoreProvider>
  );
}
