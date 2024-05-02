import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Params } from '~/core/params';

import { Component } from './component';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

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
  const space = await cachedFetchSpace(spaceId);
  const initialParams = Params.parseTripleQueryFilterFromParams(searchParams);
  const configEntity = space?.spaceConfig;

  const spaceName = space?.spaceConfig?.name ?? space?.id ?? '';
  const spaceImage = configEntity ? configEntity.image : PLACEHOLDER_SPACE_IMAGE;

  return {
    spaceId,
    spaceName: spaceName ?? null,
    spaceImage: spaceImage ?? null,
    initialParams,
  };
};
