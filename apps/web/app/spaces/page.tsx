import * as React from 'react';
import Head from 'next/head';
import { cookies } from 'next/headers';

import { OboardingCarousel } from '~/modules/components/onboarding-carousel/carousel';
import { Email } from '~/modules/components/onboarding-carousel/email';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { Card } from '~/modules/design-system/card';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Network } from '~/modules/services/network';
import { StorageClient } from '~/modules/services/storage';
import { getConfig } from '~/modules/config/config';
import { Params } from '~/modules/params';

export default async function Spaces({ searchParams: { env } }: { searchParams: { env?: string } }) {
  const appCookies = cookies();
  const config = Params.getConfigFromUrl(
    // @TODO: Pass searchParams instead of full url
    `https://whatever.com?env=${env}`,
    appCookies.get(Params.ENV_PARAM_NAME)?.value
  );
  const storage = new StorageClient(config.ipfs);
  const network = new Network(storage, config.subgraph);
  const spaces = await network.fetchSpaces();

  console.log('env', env);

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
