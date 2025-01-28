import { SYSTEM_IDS } from '@geogenesis/sdk';
import { notFound } from 'next/navigation';

import { TableBlockSdk } from '~/core/blocks-sdk';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Subgraph } from '~/core/io';
import { Space } from '~/core/io/dto/spaces';
import { fetchColumns } from '~/core/io/fetch-columns';
import { FetchRowsOptions, fetchRows } from '~/core/io/fetch-rows';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/core/io/fetch-types';
import { Params } from '~/core/params';
import { InitialEntityTableStoreParams } from '~/core/state/entity-table-store/entity-table-store-params';
import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store/constants';
import { EntityTable } from '~/core/utils/entity-table';

import { Component } from './component';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    query?: string;
    page?: string;
    typeId?: string;
  }>;
}

export default async function EntitiesPage(props0: Props) {
  const searchParams = await props0.searchParams;
  const params = await props0.params;
  const spaceId = params.id;
  const initialParams = Params.parseEntityTableQueryFilterFromParams(searchParams);

  const space = await cachedFetchSpace(spaceId);
  const props = await getData({ space, initialParams });

  return <Component {...props} />;
}

const getData = async ({
  space,
  initialParams,
}: {
  space: Space | null;
  initialParams: InitialEntityTableStoreParams;
}) => {
  if (!space) {
    notFound();
  }

  const spaceId = space.id;
  const configEntity = space?.spaceConfig;

  const spaceName = configEntity ? configEntity.name : space.id;
  const spaceImage = configEntity ? configEntity.image : PLACEHOLDER_SPACE_IMAGE;

  const [initialSpaceTypes, initialForeignTypes] = await Promise.all([
    fetchSpaceTypeTriples(spaceId),
    fetchForeignTypeTriples(space),
  ]);

  // This can be empty if there are no types in the Space
  const initialTypes = [...initialSpaceTypes, ...initialForeignTypes];
  const defaultTypeId = configEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.DEFAULT_TYPE)?.value.value;

  const initialSelectedType =
    initialTypes.find(t => t.entityId === (initialParams.typeId || defaultTypeId)) || initialTypes[0] || null;

  // initialTypes[0] can be empty if there's no types in the space
  const typeId: string | null = initialSelectedType?.entityId ?? null;

  const fetchParams: FetchRowsOptions['params'] = {
    ...initialParams,
    first: DEFAULT_PAGE_SIZE,
    skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    filter: TableBlockSdk.createGraphQLStringFromFilters([
      {
        columnId: SYSTEM_IDS.NAME_ATTRIBUTE,
        value: initialParams.query,
        valueType: 'TEXT',
      },
      {
        columnId: SYSTEM_IDS.SPACE_FILTER,
        value: spaceId,
        valueType: 'TEXT',
      },
    ]),
  };

  const serverColumns = await fetchColumns({
    typeIds: typeId ? [typeId] : [],
  });

  const serverRows = await fetchRows({
    api: {
      fetchTableRowEntities: Subgraph.fetchTableRowEntities,
    },
    params: fetchParams,
  });

  const finalRows = EntityTable.fromColumnsAndRows(serverRows, serverColumns);

  return {
    space,
    spaceName: spaceName ?? null,
    spaceImage,
    initialSelectedType,
    initialForeignTypes,
    initialColumns: serverColumns,
    initialRows: finalRows,
    initialTypes,
    initialParams,
  };
};
