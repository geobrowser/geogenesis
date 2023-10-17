import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { TableBlockSdk } from '~/core/blocks-sdk';
import { AppConfig } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { fetchColumns } from '~/core/io/fetch-columns';
import { FetchRowsOptions, fetchRows } from '~/core/io/fetch-rows';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';
import { Params } from '~/core/params';
import { InitialEntityTableStoreParams } from '~/core/state/entity-table-store';
import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store';
import { ServerSideEnvParams, Space } from '~/core/types';
import { EntityTable } from '~/core/utils/entity-table';

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
  const spaceId = params.id;
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const initialParams = Params.parseEntityTableQueryFilterFromParams(searchParams);
  const config = Params.getConfigFromParams(searchParams, env);

  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: spaceId });
  let usePermissionlessSubgraph = false;

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: spaceId });
    if (space) usePermissionlessSubgraph = true;
  }

  if (usePermissionlessSubgraph) {
    config.subgraph = config.permissionlessSubgraph;
  }

  const props = await getData({ space, config, initialParams });

  return <Component {...props} />;
}

const getData = async ({
  space,
  config,
  initialParams,
}: {
  space: Space | null;
  config: AppConfig;
  initialParams: InitialEntityTableStoreParams;
}) => {
  if (!space) {
    notFound();
  }

  const spaceId = space.id;

  const spaces = await Subgraph.fetchSpaces({ endpoint: config.subgraph });

  const spaceImage = space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceName = spaceNames[spaceId];

  const [initialSpaceTypes, initialForeignTypes, defaultTypeTriples] = await Promise.all([
    fetchSpaceTypeTriples(Subgraph.fetchTriples, spaceId, config.subgraph),
    fetchForeignTypeTriples(Subgraph.fetchTriples, space, config.subgraph),
    Subgraph.fetchTriples({
      endpoint: config.subgraph,
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

  const defaultTypeId = defaultTypeTriples[0]?.value.id;

  const initialSelectedType =
    initialTypes.find(t => t.entityId === (initialParams.typeId || defaultTypeId)) || initialTypes[0] || null;

  // initialTypes[0] can be empty if there's no types in the space
  const typeId: string | null = initialSelectedType?.entityId ?? null;

  const fetchParams: FetchRowsOptions['params'] = {
    ...initialParams,
    endpoint: config.subgraph,
    first: DEFAULT_PAGE_SIZE,
    skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    typeIds: typeId ? [typeId] : [],
    filter: TableBlockSdk.createGraphQLStringFromFilters(
      [
        {
          columnId: SYSTEM_IDS.NAME,
          value: initialParams.query,
          valueType: 'string',
        },
        {
          columnId: SYSTEM_IDS.SPACE,
          value: spaceId,
          valueType: 'string',
        },
      ],
      typeId
    ),
  };

  const serverColumns = await fetchColumns({
    params: fetchParams,
    api: {
      fetchTriples: Subgraph.fetchTriples,
      fetchEntity: Subgraph.fetchEntity,
    },
  });

  const serverRows = await fetchRows({
    api: {
      fetchTableRowEntities: Subgraph.fetchTableRowEntities,
    },
    params: fetchParams,
  });

  const { rows: finalRows } = EntityTable.fromColumnsAndRows(serverRows, serverColumns);

  return {
    space,
    spaceName,
    spaceImage,
    initialSelectedType,
    initialForeignTypes,
    initialColumns: serverColumns,
    initialRows: finalRows,
    initialTypes,
    initialParams,
  };
};
