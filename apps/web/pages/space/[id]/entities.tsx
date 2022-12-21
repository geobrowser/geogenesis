import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { EntityTableContainer } from '~/modules/components/entity-table/entity-table-container';
import { SpaceHeader } from '~/modules/components/space/space-header';
import { SpaceNavbar } from '~/modules/components/space/space-navbar';
import { AppConfig } from '~/modules/config';
import { SYSTEM_IDS } from '~/modules/constants';
import { Spacer } from '~/modules/design-system/spacer';
import { Entity } from '~/modules/models/Entity';
import { Params } from '~/modules/params';
import { INetwork, Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { InitialEntityTableStoreParams } from '~/modules/state/entity-table-store';
import { EntityTableStoreProvider } from '~/modules/state/entity-table-store-provider';
import { DEFAULT_PAGE_SIZE } from '~/modules/state/triple-store';
import { Column, Row, Triple } from '~/modules/types';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
  initialSelectedType: Triple;
  initialTypes: Triple[];
  initialColumns: Column[];
  initialRows: Row[];
  config: AppConfig;
}

export default function EntitiesPage({
  spaceId,
  spaceName,
  spaceImage,
  initialColumns,
  initialSelectedType,
  initialRows,
  initialTypes,
  config,
}: Props) {
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
        space={spaceId}
        config={config}
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

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.params?.id as string;
  const initialParams = Params.parseEntityTableQueryParameters(context.resolvedUrl);
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);
  const storage = new StorageClient(config.ipfs);

  const network = new Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId);
  const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceName = spaceNames[spaceId];

  const initialTypes = await fetchSpaceTypeTriples(network, spaceId);

  const initialSelectedType = (
    initialParams.typeId ? initialTypes.find(t => t.entityId === initialParams.typeId) : initialTypes[0]
  ) as Triple;

  const params = {
    ...initialParams,
    typeId: initialSelectedType.entityId,
  };

  const { columns, rows } = await fetchEntityTableData({
    spaceId,
    params,
    config,
  });

  return {
    props: {
      config,
      spaceId,
      spaceName,
      spaceImage,
      initialSelectedType,
      initialColumns: columns,
      initialRows: rows,
      initialTypes,
    },
  };
};

export const fetchSpaceTypeTriples = async (network: INetwork, spaceId: string) => {
  /* Fetch all entities with a type of type (e.g. Person / Place / Claim) */
  const { triples } = await network.fetchTriples({
    query: '',
    space: spaceId,
    skip: 0,
    first: 100,
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPE },
      {
        field: 'linked-to',
        value: SYSTEM_IDS.TYPE_VALUE,
      },
    ],
  });

  return triples;
};

export const fetchEntityTableData = async ({
  spaceId,
  params,
  config,
}: {
  spaceId: string;
  params: InitialEntityTableStoreParams;
  config: AppConfig;
}) => {
  const storage = new StorageClient(config.ipfs);
  const subgraph = config.subgraph;

  /* To get our columns, fetch the all attributes from that type (e.g. Person -> Attributes -> Age) */
  const columnsTriples = await new Network(storage, subgraph).fetchTriples({
    query: '',
    space: spaceId,
    first: 100,
    skip: 0,
    filter: [
      { field: 'entity-id', value: params.typeId },
      { field: 'attribute-id', value: SYSTEM_IDS.TYPE_ATTRIBUTES },
    ],
  });

  /* To get our rows, first we get all of the entity IDs of the selected type */
  const rowEntityIds = (
    await new Network(storage, subgraph).fetchTriples({
      query: params.query,
      space: spaceId,
      first: DEFAULT_PAGE_SIZE,
      skip: params.pageNumber * DEFAULT_PAGE_SIZE,
      filter: [
        { field: 'attribute-id', value: SYSTEM_IDS.TYPE },
        { field: 'linked-to', value: params.typeId },
      ],
    })
  ).triples.map(triple => triple.entityId);

  /* Then we then fetch all triples associated with those entity IDs */
  const rowTriples = await Promise.all(
    rowEntityIds.map(entityId =>
      new Network(storage, subgraph).fetchTriples({
        space: spaceId,
        query: '',
        skip: 0,
        first: 100,
        filter: [{ field: 'entity-id', value: entityId }],
      })
    )
  );

  /* Name and Type are the default columns... */
  const defaultColumns = [
    {
      name: 'Name',
      id: SYSTEM_IDS.NAME,
    },
    {
      name: 'Type',
      id: SYSTEM_IDS.TYPE,
    },
  ];

  /* ...and then we can format our user-defined schemaColumns */
  const schemaColumns = columnsTriples.triples.map(triple => ({
    name: Entity.entityName(triple) || triple.value.id,
    id: triple.value.id,
  })) as Column[];

  const columns = [...defaultColumns, ...schemaColumns];

  /* Finally, we can build our initialRows */
  const rows = rowTriples.map(row => {
    return row.triples.reduce((acc, triple) => {
      const column = columns.find(column => column.id === triple.attributeId);

      /* If the column doesn't exist, we don't want to add it to the row */
      if (!column) {
        return acc;
      }

      /* Multiple triples are allowed to be displayed in a single column */
      return {
        ...acc,
        [column.id]: {
          columnId: column.id,
          triples: [...(acc[column.id]?.triples ?? []), triple],
        },
      };
    }, {} as Row);
  });

  return {
    columns,
    rows,
  };
};
