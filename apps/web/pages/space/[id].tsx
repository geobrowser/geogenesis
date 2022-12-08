import { GetServerSideProps } from 'next';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { getConfigFromUrl } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { useSpaces } from '~/modules/state/use-spaces';

// We're dynamically importing the Triples so we can disable SSR. There are hydration mismatches since
// the server doesn't know what wallet is connected, and we may render differently based on chain and wallet
// address.
const Triples = dynamic(() => import('~/modules/components/triples'), {
  ssr: false,
});

interface Props {
  spaceId: string;
  spaceName?: string;
}

export default function TriplesPage({ spaceId, spaceName }: Props) {
  return (
    <div>
      <Head>
        <title>{spaceName ?? spaceId}</title>
        <meta property="og:url" content={`https://geobrowser.io/${spaceId}}`} />
      </Head>
      <Triples spaceId={spaceId} />
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.params?.id as string;

  const config = getConfigFromUrl(context.resolvedUrl);
  const storage = new StorageClient(config.ipfs);
  const network = new Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();
  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceName = spaceNames[spaceId];

  return {
    props: {
      spaceId,
      spaceName,
    },
  };
};
