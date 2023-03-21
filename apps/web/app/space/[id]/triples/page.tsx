import * as React from 'react';
import Head from 'next/head';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { Params } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { DEFAULT_PAGE_SIZE } from '~/modules/triple';
import { cookies } from 'next/headers';
import { TriplesPageClient } from './triples-page';

interface Props {
  params: { id: string };
  searchParams: { env?: string; query?: string; pageNumber?: number; filterState?: string; typeId?: string | null };
}

export default async function TriplesPage({ params, searchParams }: Props) {
  const { spaceId, spaceName, spaceImage, initialTriples } = await getTriplesTableData(
    params.id,
    searchParams,
    searchParams.env
  );

  return (
    <div>
      <Head>
        <title>{spaceName ?? spaceId}</title>
        <meta property="og:url" content={`https://geobrowser.io/${spaceId}}`} />
      </Head>

      <TriplesPageClient
        spaceId={spaceId}
        initialTriples={initialTriples}
        spaceImage={spaceImage}
        spaceName={spaceName}
      />
    </div>
  );
}

export const getTriplesTableData = async (spaceId: string, tripleTableParams: Props['searchParams'], env?: string) => {
  const appCookies = cookies();
  const config = Params.getConfigFromUrl(
    // @TODO: Pass searchParams instead of full url
    `https://whatever.com?env=${env}`,
    appCookies.get(Params.ENV_PARAM_NAME)?.value
  );

  const storage = new StorageClient(config.ipfs);
  const network = new Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId);
  const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceName = spaceNames[spaceId];
  const triples = await network.fetchTriples({
    query: tripleTableParams.query ?? '',
    space: spaceId,
    first: DEFAULT_PAGE_SIZE,
    skip: (tripleTableParams?.pageNumber ?? 0) * DEFAULT_PAGE_SIZE,
    // @TODO: Fix filterState parsing from url
    filter: [],
  });

  return {
    spaceId,
    spaceName,
    spaceImage,
    initialTriples: triples.triples,
  };
};
