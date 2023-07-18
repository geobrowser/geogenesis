import { cookies } from 'next/headers';
import type { Metadata } from 'next';

import { NetworkData } from '~/modules/io';
import { Params } from '~/modules/params';
import { StorageClient } from '~/modules/services/storage';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/modules/spaces/fetch-types';
import { Component } from './component';
import { ServerSideEnvParams } from '~/modules/types';

interface Props {
  params: { id: string };
  searchParams: ServerSideEnvParams & {
    typeId?: string;
    filterId?: string;
    filterValue?: string;
  };
}

export const generateMetadata = async ({ params, searchParams }: Props): Promise<Metadata> => {
  const spaceId = params.id;

  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const storage = new StorageClient(config.ipfs);
  const network = new NetworkData.Network(storage, config.subgraph);

  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId) ?? null;

  return {
    title: `Geo - ${space?.attributes.name} - Create entity`,
    openGraph: {
      title: `Geo - ${space?.attributes.name} - Create entity`,
    },
    twitter: {
      title: `Geo - ${space?.attributes.name} - Create entity`,
    },
  };
};

export default async function CreateEntity({ params, searchParams }: Props) {
  const props = await getData({ params, searchParams });

  return <Component {...props} />;
}

export const getData = async ({ params, searchParams }: Props) => {
  const spaceId = params.id as string;
  const typeId = searchParams.typeId as string | undefined;
  const filterId = searchParams.filterId as string | undefined;
  const filterValue = searchParams.filterValue as string | undefined;

  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const storage = new StorageClient(config.ipfs);
  const network = new NetworkData.Network(storage, config.subgraph);

  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId) ?? null;

  const [spaceTypes, foreignSpaceTypes] = await Promise.all([
    fetchSpaceTypeTriples(network, spaceId),
    space ? fetchForeignTypeTriples(network, space) : [],
  ]);

  return {
    spaceId,
    typeId: typeId ?? null,
    filterId: filterId ?? null,
    filterValue: filterValue ?? null,
    space,
    spaceTypes: [...spaceTypes, ...foreignSpaceTypes],
  };
};
