import * as React from 'react';

import { Subgraph } from '~/core/io';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';

import { TypesStoreProvider } from './types-store';

interface Props {
  spaceId: string;
  children: React.ReactNode;
}

export async function TypesStoreServerContainer({ spaceId, children }: Props) {
  const space = await Subgraph.fetchSpace({ id: spaceId });

  const [types, foreignTypes] = await Promise.all([
    fetchSpaceTypeTriples(spaceId),
    space ? fetchForeignTypeTriples(space) : [],
  ]);

  return (
    <TypesStoreProvider space={space} initialTypes={[...types, ...foreignTypes]}>
      {children}
    </TypesStoreProvider>
  );
}
