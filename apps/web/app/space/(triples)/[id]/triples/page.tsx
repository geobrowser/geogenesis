import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { Entity } from '~/core/utils/entity';

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
  const space = await Subgraph.fetchSpace({ id: spaceId });
  const initialParams = Params.parseTripleQueryFilterFromParams(searchParams);
  const configEntity = space?.spaceConfig;

  const spaceName = space?.spaceConfig?.name ? space.spaceConfig?.name : space?.id ?? '';
  const spaceImage = configEntity ? Entity.cover(configEntity.triples) : PLACEHOLDER_SPACE_IMAGE;

  return {
    spaceId,
    spaceName: spaceName ?? null,
    spaceImage: spaceImage ?? null,
    initialParams,
  };
};
