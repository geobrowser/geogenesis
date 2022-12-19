import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Entities } from '~/modules/components/entities/entities';
import { SpaceHeader } from '~/modules/components/space/space-header';
import { SpaceNavbar } from '~/modules/components/space/space-navbar';
import { SYSTEM_IDS } from '~/modules/constants';
import { Spacer } from '~/modules/design-system/spacer';
import { Entity } from '~/modules/models/Entity';
import { Params } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { TableStoreProvider } from '~/modules/state/table-store-provider';
import { DEFAULT_PAGE_SIZE } from '~/modules/state/triple-store';
import { Column, Row, Triple } from '~/modules/types';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
  initialType: Triple;
  initialTypes: Triple[];
  initialColumns: Column[];
  initialRows: Row[];
}

export default function EntitiesPage({
  spaceId,
  spaceName,
  spaceImage,
  initialColumns,
  initialType,
  initialRows,
  initialTypes,
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

      <TableStoreProvider
        space={spaceId}
        initialRows={initialRows}
        initialType={initialType}
        initialColumns={initialColumns}
        initialTypes={initialTypes}
      >
        <Entities
          types={initialTypes}
          spaceId={spaceId}
          spaceName={spaceName}
          initialColumns={initialColumns}
          initialRows={initialRows}
        />
      </TableStoreProvider>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.params?.id as string;
  const initialParams = Params.parseTripleQueryParameters(context.resolvedUrl);
  const config = Params.getConfigFromUrl(context.resolvedUrl);

  const storage = new StorageClient(config.ipfs);
  const network = new Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId);
  const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceName = spaceNames[spaceId];

  /* Fetch all entities with a type of type (e.g. Person / Place / Claim) */
  const types = await network.fetchTriples({
    query: initialParams.query,
    space: spaceId,
    first: DEFAULT_PAGE_SIZE,
    skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPE },
      {
        field: 'linked-to',
        value: SYSTEM_IDS.TYPE_VALUE,
      },
    ],
  });

  /* Get the first type */
  const initialType = types.triples[1];

  /* To get our columns, fetch the all attributes from that type (e.g. Person -> Attributes -> Age) */
  const columnsTriples = await network.fetchTriples({
    query: initialParams.query,
    space: spaceId,
    first: DEFAULT_PAGE_SIZE,
    skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    filter: [
      { field: 'entity-id', value: initialType.entityId },
      { field: 'attribute-id', value: SYSTEM_IDS.TYPE_ATTRIBUTES },
    ],
  });

  /* To get our rows, first we get all of the entity IDs of the selected type */
  const rowEntityIds = (
    await network.fetchTriples({
      query: initialParams.query,
      space: spaceId,
      first: DEFAULT_PAGE_SIZE,
      skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
      filter: [
        { field: 'attribute-id', value: SYSTEM_IDS.TYPE },
        { field: 'linked-to', value: initialType.entityId },
      ],
    })
  ).triples.map(triple => triple.entityId);

  /* Then we then fetch all triples associated with those entity IDs */
  const rowTriples = await Promise.all(
    rowEntityIds.map(entityId =>
      new Network(storage, config.subgraph).fetchTriples({
        space: spaceId,
        query: '',
        skip: 0,
        first: 100,
        filter: [{ field: 'entity-id', value: entityId }],
      })
    )
  );

  /* ...and then we can build our initialColumns */
  const initialColumns = columnsTriples.triples.map(triple => ({
    name: Entity.entityName(triple) || triple.value.id,
    id: triple.value.id,
  })) as Column[];

  /* Finally, we can build our initialRows */
  const initialRows = rowTriples.map(row => {
    return row.triples.reduce((acc, triple) => {
      const column = initialColumns.find(column => column.id === triple.attributeId);

      /* If the column doesn't exist, we don't want to add it to the row */
      if (!column) {
        return acc;
      }

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
    props: {
      spaceId,
      spaceName,
      spaceImage,
      initialType,
      initialColumns,
      rowTriples,
      initialTypes: types.triples,
      initialRows,
    },
  };
};
