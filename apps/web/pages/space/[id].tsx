import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { Triples } from '~/modules/components/triples';
import { SYSTEM_IDS } from '~/modules/constants';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { TripleStoreProvider } from '~/modules/stores/triple-store-provider';
import { Triple } from '~/modules/types';
import { Params } from '~/modules/params';
import { DEFAULT_PAGE_SIZE } from '~/modules/stores/triple-store';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
  initialTriples: Triple[];
}

export default function TriplesPage({ spaceId, spaceName, spaceImage, initialTriples }: Props) {
  return (
    <div>
      <Head>
        <title>{spaceName ?? spaceId}</title>
        <meta property="og:url" content={`https://geobrowser.io/${spaceId}}`} />
      </Head>
      <TripleStoreProvider space={spaceId} initialTriples={initialTriples}>
        <Triples spaceId={spaceId} spaceName={spaceName} spaceImage={spaceImage} initialTriples={initialTriples} />
      </TripleStoreProvider>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.params?.id as string;
  const initialParams = Params.parseQueryParameters(context.resolvedUrl);
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);

  const storage = new StorageClient(config.ipfs);
  const network = new Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId);
  const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceName = spaceNames[spaceId];
  const triples = await network.fetchTriples({
    query: initialParams.query,
    space: spaceId,
    first: DEFAULT_PAGE_SIZE,
    skip: initialParams.pageNumber * DEFAULT_PAGE_SIZE,
    filter: initialParams.filterState,
  });

  return {
    props: {
      spaceId,
      spaceName,
      spaceImage,
      initialTriples: triples.triples,
    },
  };
};
