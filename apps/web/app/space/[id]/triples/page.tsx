import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';

import * as React from 'react';

import { DEFAULT_TRIPLES_PAGE_SIZE } from '~/core/constants';
import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { ServerSideEnvParams } from '~/core/types';

import { Component } from './component';

interface Props {
  params: { id: string };
  searchParams: ServerSideEnvParams & {
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
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: spaceId });
  const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const spaceName = space?.attributes[SYSTEM_IDS.NAME];
  const triples = await Subgraph.fetchTriples({
    endpoint: config.subgraph,
    query: '',
    space: spaceId,
    first: DEFAULT_TRIPLES_PAGE_SIZE,
    skip: 0,
    filter: [],
  });

  return {
    spaceId,
    spaceName,
    spaceImage,
    initialTriples: triples,
  };
};
