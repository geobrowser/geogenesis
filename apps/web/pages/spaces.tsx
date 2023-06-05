import * as React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';

import { OboardingCarousel } from '~/modules/components/onboarding-carousel/carousel';
import { Email } from '~/modules/components/onboarding-carousel/email';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { Card } from '~/modules/design-system/card';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';
import { Params } from '~/modules/params';
import { NetworkData } from '~/modules/io';
import { StorageClient } from '~/modules/services/storage';
import { Space } from '~/modules/types';
import { DEFAULT_OPENGRAPH_IMAGE } from '~/modules/constants';

interface Props {
  spaces: Space[];
}

// Right now there is no way to remove Spaces from the Space Registry and Subgraph store.
// Temporarily we just filter some Spaces when we fetch Spaces.
export const HIDDEN_SPACES: Array<string> = [
  '0x276187Ac0D3a61EAAf3D5Af443dA932EFba7A661', // Abundant Housing in San Francisco
  '0xdb1c4a316933cd481860cfCa078eE07ea7Ad4EdD', // Transitional Housing in San Francisco
  '0xEC07c19743179f1AC904Fee97a1A99310e500aB6', // End Homelessness in San Francisco
  '0x1b7a66284C31A8D11a790ec79916c425Ef6E7886', // The Graph
];

export default function Spaces({ spaces }: Props) {
  return (
    <div>
      <Head>
        <title>Geo Genesis</title>
        <meta property="og:title" content="Geo Genesis" />
        <meta
          name="description"
          content="Browse and organize the world's public knowledge and information in a decentralized way."
        />
        <meta
          property="og:description"
          content="Browse and organize the world's public knowledge and information in a decentralized way."
        />
        <meta property="og:url" content={`https://geobrowser.io/spaces`} />
        <meta property="og:image" content={DEFAULT_OPENGRAPH_IMAGE} />
        <meta name="twitter:image" content={DEFAULT_OPENGRAPH_IMAGE} />
        <link rel="preload" as="image" href={DEFAULT_OPENGRAPH_IMAGE} />
      </Head>
      <div className="flex flex-col">
        <Text variant="mainPage">All spaces</Text>
        <Spacer height={40} />
        <div className="grid grid-cols-3 gap-4 xl:items-center lg:grid-cols-2 sm:grid-cols-1">
          {spaces.map(space => {
            // @HACK: Right now we hide some spaces from the front page. There's no way to remove
            // Spaces from the Subgraph store yet.
            if (HIDDEN_SPACES.includes(space.id)) return null;

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

  try {
    const network = new NetworkData.Network(storage, config.subgraph);
    const spaces = await network.fetchSpaces();

    return {
      props: {
        spaces,
      },
    };
  } catch (e) {
    console.error('Could not fetch spaces', e);

    return {
      props: {
        spaces: [],
      },
    };
  }
};
