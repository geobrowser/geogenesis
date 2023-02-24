import * as React from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useLogRocket } from '~/modules/analytics/use-logrocket';
import { OboardingCarousel } from '~/modules/components/onboarding-carousel/carousel';
import { Email } from '~/modules/components/onboarding-carousel/email';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { Card } from '~/modules/design-system/card';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Params } from '~/modules/params';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { Space } from '~/modules/types';

interface Props {
  spaces: Space[];
}

export default function Spaces({ spaces }: Props) {
  const rootSpaceId = spaces.find(space => space.isRootSpace)?.id ?? '';
  useLogRocket(rootSpaceId);

  return (
    <div>
      <Head>
        <meta property="og:url" content={`https://geobrowser.io/spaces`} />
      </Head>
      <div className="flex flex-col">
        <Text variant="mainPage">All spaces</Text>
        <Spacer height={40} />
        <div className="grid grid-cols-3 gap-4 xl:items-center lg:grid-cols-2 sm:grid-cols-1">
          {spaces.map(space => {
            const name = space.attributes.name;
            const image = space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE];

            return <Card key={space.id} spaceId={space.id} name={name} image={image} />;
          })}
        </div>
        <Spacer height={100} />
        <div className="max-w-[830px] self-center text-center">
          <Text variant="largeTitle">
            Together we can change how society is organized, put power into the hands of those who’ve earned it, and
            distribute resources and opportunity far and wide.
          </Text>
        </div>
        <Spacer height={40} />
        <OboardingCarousel />
        <Spacer height={100} />
        <Email />
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);
  const storage = new StorageClient(config.ipfs);
  const network = new Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();

  return {
    props: {
      spaces,
    },
  };
};
