import { SYSTEM_IDS } from '@geogenesis/ids';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';

import { EntityTableContainer } from '~/modules/components/entity-table/entity-table-container';
import { SpaceHeader } from '~/modules/components/space/space-header';
import { SpaceNavbar } from '~/modules/components/space/space-navbar';
import { Spacer } from '~/modules/design-system/spacer';
import { DEFAULT_PAGE_SIZE, EntityTable, EntityTableStoreProvider } from '~/modules/entity';
import { Params } from '~/modules/params';
import { NetworkData } from '~/modules/io';
import { StorageClient } from '~/modules/services/storage';
import { Column, Row, Space, Triple } from '~/modules/types';
import { TypesStoreProvider } from '~/modules/type/types-store';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/modules/spaces/fetch-types';
import { DEFAULT_OPENGRAPH_IMAGE } from '~/modules/constants';
import { FetchRowsOptions } from '~/modules/io/data-source/network';
import { TableBlockSdk } from '~/modules/components/editor/blocks/sdk';

interface Props {
  space: Space;
  spaceName?: string;
  spaceImage: string | null;
  initialSelectedType: Triple | null;
  initialTypes: Triple[];
  initialColumns: Column[];
  initialRows: Row[];
}

export default function EntitiesPage({
  space,
  spaceName,
  spaceImage,
  initialColumns,
  initialSelectedType,
  initialRows,
  initialTypes,
}: Props) {
  const opengraphUrl = spaceImage || DEFAULT_OPENGRAPH_IMAGE;

  return (
    <div>
      <Head>
        <title>{spaceName ?? space.id}</title>
        <meta property="og:title" content={spaceName} />
        <meta property="og:url" content={`https://geobrowser.io/${space.id}}`} />
        <meta property="og:image" content={opengraphUrl} />
        <meta name="twitter:image" content={opengraphUrl} />
      </Head>
      <SpaceHeader spaceId={space.id} spaceImage={spaceImage} spaceName={spaceName} />
      <Spacer height={34} />
      <SpaceNavbar spaceId={space.id} />
      <TypesStoreProvider initialTypes={initialTypes} space={space}>
        <EntityTableStoreProvider
          spaceId={space.id}
          initialRows={initialRows}
          initialSelectedType={initialSelectedType}
          initialColumns={initialColumns}
        >
          <EntityTableContainer
            spaceId={space.id}
            spaceName={spaceName}
            initialColumns={initialColumns}
            initialRows={initialRows}
          />
        </EntityTableStoreProvider>
      </TypesStoreProvider>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.params?.id as string;
  const initialParams = Params.parseEntityTableQueryParameters(context.resolvedUrl);
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);
  const storage = new StorageClient(config.ipfs);

  const network = new NetworkData.Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId);

  if (!space)
    return {
      notFound: true,
    };

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

  const initialTypes = [...initialSpaceTypes, ...initialForeignTypes];

  const defaultTypeId = defaultTypeTriples.triples[0]?.value.id;

  const initialSelectedType =
    initialTypes.find(t => t.entityId === (initialParams.typeId || defaultTypeId)) || initialTypes[0] || null;

  const typeId: string | undefined = initialSelectedType?.entityId;

  const params: FetchRowsOptions['params'] = {
    ...initialParams,
    first: DEFAULT_PAGE_SIZE,
    skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    typeIds: typeId ? [typeId] : [],
    filter: TableBlockSdk.createFilterGraphQLString([], typeId ?? ''),
  };

  const { columns } = await network.columns({
    params,
  });

  const { rows: serverRows } = await network.rows({
    params,
  });

  const { rows } = EntityTable.fromColumnsAndRows(spaceId, serverRows, columns);

  return {
    props: {
      space,
      spaceName,
      spaceImage,
      initialSelectedType,
      initialForeignTypes,
      initialColumns: columns,
      initialRows: rows,
      initialTypes,
    },
  };
};
