import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useLogRocket } from '~/modules/analytics/use-logrocket';
import { EntityTableContainer } from '~/modules/components/entity-table/entity-table-container';
import { SpaceHeader } from '~/modules/components/space/space-header';
import { SpaceNavbar } from '~/modules/components/space/space-navbar';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { Spacer } from '~/modules/design-system/spacer';
import { Params } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { EntityTableStoreProvider } from '~/modules/entity';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
}

export default function EntitiesPage({ spaceId, spaceName, spaceImage }: Props) {
  useLogRocket(spaceId);

  return (
    <div>
      <Head>
        <title>{spaceName ?? spaceId}</title>
        <meta property="og:url" content={`https://geobrowser.io/${spaceId}}`} />
      </Head>
      <SpaceHeader spaceId={spaceId} spaceImage={spaceImage} spaceName={spaceName} />

      <Spacer height={34} />
      <SpaceNavbar spaceId={spaceId} />

      <EntityTableStoreProvider space={spaceId}>
        <EntityTableContainer spaceId={spaceId} spaceName={spaceName} />
      </EntityTableStoreProvider>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.params?.id as string;
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);
  const storage = new StorageClient(config.ipfs);

  const network = new Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId);
  const spaceImage = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));
  const spaceName = spaceNames[spaceId];

  return {
    props: {
      spaceId,
      spaceName,
      spaceImage,
    },
  };
};
