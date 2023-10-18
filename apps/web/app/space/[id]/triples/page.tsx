import { SYSTEM_IDS } from '@geogenesis/ids';

import * as React from 'react';

import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store';

import { Component } from './component';

interface Props {
  params: { id: string };
  searchParams: {
    query?: string;
    page?: string;
  };
}

export default async function TriplesPage({ params, searchParams }: Props) {
  const props = await getData({ params, searchParams });

  return <Component {...props} />;
}

const getData = async ({ params, searchParams }: Props) => {
  const spaceId = params.id;
  let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: params.id });
  let usePermissionlessSubgraph = false;

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: params.id });
    if (space) usePermissionlessSubgraph = true;
  }

  if (usePermissionlessSubgraph) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const initialParams = Params.parseTripleQueryFilterFromParams(searchParams);

  const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const spaceName = space?.attributes[SYSTEM_IDS.NAME];
  const triples = await Subgraph.fetchTriples({
    endpoint: config.subgraph,
    query: initialParams.query,
    space: spaceId,
    first: DEFAULT_PAGE_SIZE,
    skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    filter: initialParams.filterState,
  });

  return {
    spaceId,
    spaceName,
    spaceImage,
    initialTriples: triples,
    initialParams,
  };
};
