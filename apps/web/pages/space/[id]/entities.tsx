import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { EntityTableContainer } from '~/modules/components/entity-table/entity-table-container';
import { SpaceHeader } from '~/modules/components/space/space-header';
import { SpaceNavbar } from '~/modules/components/space/space-navbar';
import { AppConfig } from '~/modules/config';
import { SYSTEM_IDS } from '~/modules/constants';
import { Spacer } from '~/modules/design-system/spacer';
import { Params } from '~/modules/params';
import { INetwork, Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { EntityTableStoreProvider } from '~/modules/triple';
import { Column, Row, Triple } from '~/modules/types';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
  initialSelectedType: Triple | null;
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

  const initialTypes = (await fetchSpaceTypeTriples(network, spaceId)) || [];

  const initialSelectedType = initialTypes.find(t => t.entityId === initialParams.typeId) || initialTypes[0] || null;

  const typeId = initialSelectedType?.entityId;

  const params = {
    ...initialParams,
    typeId,
  };

  const { columns, rows } = await network.fetchEntityTableData({
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
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
      {
        field: 'linked-to',
        value: SYSTEM_IDS.SCHEMA_TYPE,
      },
    ],
  });

  return triples;
};
