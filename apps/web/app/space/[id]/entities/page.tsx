import { SYSTEM_IDS } from '@geogenesis/ids';

import { DEFAULT_PAGE_SIZE, EntityTable } from '~/core/utils/entity';
import { Params } from '~/core/params';
import { NetworkData } from '~/core/io';
import { StorageClient } from '~/core/io/storage';
import { ServerSideEnvParams } from '~/core/types';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';
import { FetchRowsOptions } from '~/core/io/data-source/network';
import { TableBlockSdk } from '~/partials/editor/blocks/sdk';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Component } from './component';

interface Props {
  params: { id: string };
  searchParams: ServerSideEnvParams & {
    query?: string;
    page?: string;
    typeId?: string;
  };
}

export default async function EntitiesPage({ params, searchParams }: Props) {
  const props = await getData({ params, searchParams });

  return <Component {...props} />;
}

const getData = async ({ params, searchParams }: Props) => {
  const spaceId = params.id;
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;

  const initialParams = Params.parseEntityTableQueryFilterFromParams(searchParams);
  const config = Params.getConfigFromParams(searchParams, env);
  const storage = new StorageClient(config.ipfs);

  const network = new NetworkData.Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId);

  if (!space) notFound();

  const spaceImage = space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceName = spaceNames[spaceId];

  const [initialSpaceTypes, initialForeignTypes, defaultTypeTriples] = await Promise.all([
    fetchSpaceTypeTriples(network, spaceId),
    fetchForeignTypeTriples(network, space),
    network.fetchTriples({
      query: '',
      skip: 0,
      first: DEFAULT_PAGE_SIZE,
      filter: [
        { field: 'entity-id', value: space.entityId ?? '' },
        {
          field: 'attribute-id',
          value: SYSTEM_IDS.DEFAULT_TYPE,
        },
      ],
    }),
  ]);

  // This can be empty if there are no types in the Space
  const initialTypes = [...initialSpaceTypes, ...initialForeignTypes];

  const defaultTypeId = defaultTypeTriples.triples[0]?.value.id;

  const initialSelectedType =
    initialTypes.find(t => t.entityId === (initialParams.typeId || defaultTypeId)) || initialTypes[0] || null;

  // initialTypes[0] can be empty if there's no types in the space
  const typeId: string | null = initialSelectedType?.entityId ?? null;

  const fetchParams: FetchRowsOptions['params'] = {
    ...initialParams,
    first: DEFAULT_PAGE_SIZE,
    skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    typeIds: typeId ? [typeId] : [],
    filter: TableBlockSdk.createGraphQLStringFromFilters([], typeId),
  };

  const { columns } = await network.columns({
    params: fetchParams,
  });

  const { rows: serverRows } = await network.rows({
    params: fetchParams,
  });

  const { rows } = EntityTable.fromColumnsAndRows(serverRows, columns);

  return {
    space,
    spaceName,
    spaceImage,
    initialSelectedType,
    initialForeignTypes,
    initialColumns: columns,
    initialRows: rows,
    initialTypes,
    initialParams,
  };
};
