import * as React from 'react';

import { API, Subgraph } from '~/core/io';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';

import { TypesStoreProvider } from './types-store';

interface Props {
  spaceId: string;
  children: React.ReactNode;
}

export async function TypesStoreServerContainer({ spaceId, children }: Props) {
  const { space } = await API.space(spaceId);

  const [types, foreignTypes] = await Promise.all([
    fetchSpaceTypeTriples(Subgraph.fetchTriples, spaceId),
    space ? fetchForeignTypeTriples(Subgraph.fetchTriples, space) : [],
  ]);

  return (
    <TypesStoreProvider space={space} initialTypes={[...types, ...foreignTypes]}>
      {children}
    </TypesStoreProvider>
  );
}
