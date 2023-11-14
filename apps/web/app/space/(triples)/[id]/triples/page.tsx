import { SYSTEM_IDS } from '@geogenesis/ids';

import * as React from 'react';

import { Environment } from '~/core/environment';
import { API, Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { Entity } from '~/core/utils/entity';

import { Component } from './component';

export const runtime = 'edge';

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

  const { space, isPermissionlessSpace } = await API.space(params.id);

  if (isPermissionlessSpace) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const initialParams = Params.parseTripleQueryFilterFromParams(searchParams);

  const configEntity = space?.spaceConfigEntityId
    ? await Subgraph.fetchEntity({
        id: space?.spaceConfigEntityId,
        endpoint: config.subgraph,
      })
    : null;

  const spaceName = configEntity ? configEntity.name : space?.attributes[SYSTEM_IDS.NAME];
  const spaceImage = configEntity
    ? Entity.cover(configEntity.triples) ?? Entity.avatar(configEntity.triples)
    : space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE];

  return {
    spaceId,
    spaceName: spaceName ?? null,
    spaceImage: spaceImage ?? null,
    initialParams,
  };
};
