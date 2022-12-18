import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Entities } from '~/modules/components/entities/entities';
import { SpaceHeader } from '~/modules/components/space/space-header';
import { SpaceNavbar } from '~/modules/components/space/space-navbar';
import { SYSTEM_IDS } from '~/modules/constants';
import { Spacer } from '~/modules/design-system/spacer';
import { Params } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { DEFAULT_PAGE_SIZE } from '~/modules/state/triple-store';
import { TripleStoreProvider } from '~/modules/state/triple-store-provider';
import { EntityNames, Triple } from '~/modules/types';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
  initialTriples: Triple[];
  initialEntityNames: EntityNames;
  types: Triple[];
}

interface Column {
  value: string; // attribute ID
  label: string;
}

type Row = Record<string, Triple[]>;

export default function EntitiesPage({
  spaceId,
  spaceName,
  spaceImage,
  initialTriples,
  initialEntityNames,
  initialColumns,
  initialType,
  rowTriples,
  initialRows,
  types,
}: Props) {
  console.log({ initialColumns, rowTriples, initialRows, initialEntityNames });

  return (
    <div>
      <Head>
        <title>{spaceName ?? spaceId}</title>
        <meta property="og:url" content={`https://geobrowser.io/${spaceId}}`} />
      </Head>
      <SpaceHeader spaceId={spaceId} spaceImage={spaceImage} spaceName={spaceName} />

      <Spacer height={34} />
      <SpaceNavbar spaceId={spaceId} />

      <TripleStoreProvider space={spaceId} initialEntityNames={initialEntityNames} initialTriples={initialTriples}>
        <Entities
          types={types}
          spaceId={spaceId}
          initialColumns={initialColumns}
          initialRows={initialRows}
          spaceName={spaceName}
          initialEntityNames={initialEntityNames}
        />
      </TripleStoreProvider>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.params?.id as string;
  const initialParams = Params.parseQueryParameters(context.resolvedUrl);
  const config = Params.getConfigFromUrl(context.resolvedUrl);

  const storage = new StorageClient(config.ipfs);
  const network = new Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId);
  const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceName = spaceNames[spaceId];

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

  // TODO: this is a hack to get the initial type to be a user-defined type and not a system type
  const initialType = types.triples[1];

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

  const typedTriples = await network.fetchTriples({
    query: initialParams.query,
    space: spaceId,
    first: DEFAULT_PAGE_SIZE,
    skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPE },
      { field: 'linked-to', value: initialType.entityId },
    ],
  });

  const rowTriples = await Promise.all(
    typedTriples.triples.map(triple =>
      new Network(storage, config.subgraph).fetchTriples({
        space: spaceId,
        query: '',
        skip: 0,
        first: 100,
        filter: [{ field: 'entity-id', value: triple.entityId }],
      })
    )
  );

  const rowTriplesEntityNames = rowTriples.reduce((acc, { entityNames }) => {
    return { ...acc, ...entityNames };
  }, {} as EntityNames);

  const triples = await network.fetchTriples({
    query: initialParams.query,
    space: spaceId,
    first: DEFAULT_PAGE_SIZE,
    skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    filter: initialParams.filterState,
  });

  const initialEntityNames = {
    ...triples.entityNames,
    ...types.entityNames,
    ...rowTriplesEntityNames,
  };

  const initialColumns = columnsTriples.triples.map(triple => ({
    label: initialEntityNames[triple.value.id],
    value: triple.value.id,
  }));

  const initialRows = rowTriples.map(row => {
    return row.triples.reduce((acc, triple) => {
      const column = initialColumns.find(column => column.value === triple.attributeId);
      if (!column) {
        return acc;
      }

      return {
        ...acc,
        [column.value]: {
          label: initialEntityNames[triple.value.id] || triple.value.value,
          value: triple.value.id,
        },
      };
    }, {} as Record<string, { label: string; value: string }>);
  });

  return {
    props: {
      spaceId,
      spaceName,
      spaceImage,
      initialType: initialType.entityId,
      initialColumns,
      initialTriples: triples.triples,
      initialEntityNames,
      rowTriples,
      types: types.triples,
      initialRows,
    },
  };
};
