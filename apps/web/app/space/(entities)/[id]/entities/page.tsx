import { SYSTEM_IDS } from '@geogenesis/ids';
import { notFound } from 'next/navigation';

import { TableBlockSdk } from '~/core/blocks-sdk';
import { AppConfig, Environment } from '~/core/environment';
import { API, Subgraph } from '~/core/io';
import { fetchColumns } from '~/core/io/fetch-columns';
import { FetchRowsOptions, fetchRows } from '~/core/io/fetch-rows';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';
import { Params } from '~/core/params';
import { InitialEntityTableStoreParams } from '~/core/state/entity-table-store/entity-table-store-params';
import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store/constants';
import { Space } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { EntityTable } from '~/core/utils/entity-table';

import { Component } from './component';

interface Props {
  params: { id: string };
  searchParams: {
    query?: string;
    page?: string;
    typeId?: string;
  };
}

export default async function EntitiesPage({ params, searchParams }: Props) {
  const spaceId = params.id;
  const initialParams = Params.parseEntityTableQueryFilterFromParams(searchParams);
  let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const { isPermissionlessSpace, space } = await API.space(spaceId);

  if (isPermissionlessSpace) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
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

  const configEntity = space?.spaceConfigEntityId
    ? await Subgraph.fetchEntity({
        id: space?.spaceConfigEntityId,
      })
    : null;

  const spaceName = configEntity ? configEntity.name : space?.attributes[SYSTEM_IDS.NAME];
  const spaceImage = configEntity
    ? Entity.cover(configEntity.triples) ?? Entity.avatar(configEntity.triples)
    : space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE];

  const [initialSpaceTypes, initialForeignTypes, defaultTypeTriples] = await Promise.all([
    fetchSpaceTypeTriples(Subgraph.fetchTriples, spaceId),
    fetchForeignTypeTriples(Subgraph.fetchTriples, space),
    Subgraph.fetchTriples({
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
    spaceName: spaceName ?? null,
    spaceImage: spaceImage ?? null,
    initialSelectedType,
    initialForeignTypes,
    initialColumns: serverColumns,
    initialRows: finalRows,
    initialTypes,
    initialParams,
  };
};
