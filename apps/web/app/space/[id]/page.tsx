import Head from 'next/head';
import { cookies } from 'next/headers';
import { SYSTEM_IDS } from '~/../../packages/ids';

import { EntityTableContainer } from '~/modules/components/entity-table/entity-table-container';
import { SpaceHeader } from '~/modules/components/space/space-header';
import { SpaceNavbar } from '~/modules/components/space/space-navbar';
import { Spacer } from '~/modules/design-system/spacer';
import { DEFAULT_PAGE_SIZE, EntityTable, EntityTableStoreProvider } from '~/modules/entity';
import { Params } from '~/modules/params';
import { INetwork, Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';

interface Props {
  params: { id: string };
  searchParams: { env?: string };
}

export default async function SpacePage({ params, searchParams }: Props) {
  const spaceId = params.id;
  const { spaceName, spaceImage, initialColumns, initialRows, initialSelectedType, initialTypes } = await getTableData(
    spaceId,
    searchParams.env
  );

  return (
    <div>
      <Head>
        <title>{spaceName ?? spaceId}</title>
        <meta property="og:url" content={`https://geobrowser.io/${spaceId}}`} />
      </Head>
      <SpaceHeader spaceId={spaceId} spaceImage={spaceImage} spaceName={spaceName} />

      <Spacer height={34} />

      <SpaceNavbar spaceId={spaceId} />

      <EntityTableStoreProvider
        spaceId={spaceId}
        initialRows={initialRows}
        initialSelectedType={initialSelectedType}
        initialColumns={initialColumns}
        initialTypes={initialTypes}
      >
        <EntityTableContainer
          spaceId={spaceId}
          spaceName={spaceName}
          initialColumns={initialColumns}
          initialRows={initialRows}
        />
      </EntityTableStoreProvider>
    </div>
  );
}

export const getTableData = async (spaceId: string, env?: string | undefined) => {
  // @TODO: Get initial params from url and pass through rest of function
  // const initialParams = Params.parseEntityTableQueryParameters(context.resolvedUrl);
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

  const [initialSpaceTypes, initialForeignTypes, defaultTypeTriples] = await Promise.all([
    fetchSpaceTypeTriples(network, spaceId),
    fetchForeignTypeTriples(network, spaceId),
    network.fetchTriples({
      query: '',
      skip: 0,
      first: DEFAULT_PAGE_SIZE,
      filter: [
        { field: 'entity-id', value: space?.entityId ?? '' },
        {
          field: 'attribute-id',
          value: SYSTEM_IDS.DEFAULT_TYPE,
        },
      ],
    }),
  ]);

  const initialTypes = [...initialSpaceTypes, ...initialForeignTypes];

  const defaultTypeId = defaultTypeTriples.triples[0]?.value.id;

  const initialSelectedType = initialTypes.find(t => t.entityId === defaultTypeId) || initialTypes[0] || null;

  const typeId = initialSelectedType?.entityId;

  const params = {
    // ...initialParams,
    query: '',
    pageNumber: 1,
    filterState: [],
    first: DEFAULT_PAGE_SIZE,
    skip: 50,
    // skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    typeId,
  };

  const [{ columns }, { rows: serverRows }] = await Promise.all([
    network.columns({
      spaceId,
      params,
    }),
    network.rows({
      spaceId,
      params,
    }),
  ]);

  const { rows } = EntityTable.fromColumnsAndRows(spaceId, serverRows, columns);

  return {
    spaceId,
    spaceName,
    spaceImage,
    initialSelectedType,
    initialColumns: columns,
    initialRows: rows,
    initialTypes,
  };
};

export const fetchForeignTypeTriples = async (network: INetwork, spaceId: string) => {
  /* Fetch all entities with a type of type (e.g. Person / Place / Claim) */
  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId);

  if (!space?.spaceConfigEntityId) {
    return [];
  }

  const foreignTypesFromSpaceConfig = await network.fetchTriples({
    query: '',
    space: spaceId,
    skip: 0,
    first: DEFAULT_PAGE_SIZE,
    filter: [
      { field: 'entity-id', value: space.spaceConfigEntityId },
      { field: 'attribute-id', value: SYSTEM_IDS.FOREIGN_TYPES },
    ],
  });

  const foreignTypesIds = foreignTypesFromSpaceConfig.triples.map(triple => triple.value.id);

  const foreignTypes = await Promise.all(
    foreignTypesIds.map(entityId =>
      network.fetchTriples({
        query: '',
        skip: 0,
        first: DEFAULT_PAGE_SIZE,
        filter: [
          { field: 'entity-id', value: entityId },
          { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
          { field: 'linked-to', value: SYSTEM_IDS.SCHEMA_TYPE },
        ],
      })
    )
  );

  return foreignTypes.flatMap(foreignType => foreignType.triples);
};

export const fetchSpaceTypeTriples = async (network: INetwork, spaceId: string) => {
  /* Fetch all entities with a type of type (e.g. Person / Place / Claim) */

  const { triples } = await network.fetchTriples({
    query: '',
    space: spaceId,
    skip: 0,
    first: DEFAULT_PAGE_SIZE,
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
      {
        field: 'linked-to',
        value: SYSTEM_IDS.SCHEMA_TYPE,
      },
    ],
  });

  return triples;
};
