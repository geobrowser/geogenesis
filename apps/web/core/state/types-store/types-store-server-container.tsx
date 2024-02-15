import * as React from 'react';

import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';

import { TypesStoreProvider } from './types-store';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

interface Props {
  spaceId: string;
  children: React.ReactNode;
}

export async function TypesStoreServerContainer({ spaceId, children }: Props) {
  const space = await cachedFetchSpace(spaceId);

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
