import { Metadata } from 'next';

import { DEFAULT_OPENGRAPH_IMAGE, PUBLIC_SPACES } from '~/core/constants';
import { Entity, Space } from '~/core/types';
import { Entity as EntityModule } from '~/core/utils/entity';

import { Card } from '~/design-system/card';
import { Spacer } from '~/design-system/spacer';

import { cachedFetchSpacesById } from '../cached-fetch-spaces-by-id';

export const metadata: Metadata = {
  title: 'Geo Genesis',
  description: "Browse and organize the world's public knowledge and information in a decentralized way.",
  twitter: {
    card: 'summary_large_image',
    title: 'Geo Genesis',
    description: "Browse and organize the world's public knowledge and information in a decentralized way.",
    site: '@geobrowser',
    creator: '@geobrowser',
    images: [
      {
        url: DEFAULT_OPENGRAPH_IMAGE,
      },
    ],
  },
  openGraph: {
    title: 'Geo Genesis',
    description: "Browse and organize the world's public knowledge and information in a decentralized way.",
    url: 'https://geobrowser.io/',
    siteName: 'geobrowser.io',
    images: [
      {
        url: DEFAULT_OPENGRAPH_IMAGE,
      },
    ],
  },

  robots: 'follow, index',
};

const sortByCreatedAtBlock = (a: Space, b: Space) =>
  parseInt(a.createdAtBlock, 10) < parseInt(b.createdAtBlock, 10) ? -1 : 1;

export const revalidate = 60; // 1 minute

export default async function Spaces() {
  // Only fetch the front page spaces.
  const spaces = await cachedFetchSpacesById(PUBLIC_SPACES);

  const filteredAndSortedSpaces = spaces.sort(sortByCreatedAtBlock);

  const spacesWithSpaceConfigs = filteredAndSortedSpaces.filter(
    (s): s is Space & { spaceConfig: Entity } => s.spaceConfig !== null
  );

  const spaceConfigs = spacesWithSpaceConfigs.map(space => {
    const entity = space.spaceConfig;

    if (!entity) {
      return {
        id: space.id,
        name: null,
        image: null,
      };
    }

    return {
      id: space.id,
      name: EntityModule.name(entity.triples) ?? null,
      image: space?.spaceConfig.image,
    };
  });

  return (
    <div className="flex flex-col">
      <h1 className="text-mainPage">All spaces</h1>
      <Spacer height={40} />
      <div className="grid grid-cols-3 gap-8 xl:items-center lg:grid-cols-2 sm:grid-cols-1">
        {spaceConfigs.map(config => (
          <Card key={config.id} spaceId={config.id} name={config.name ?? undefined} image={config.image ?? undefined} />
        ))}
      </div>
    </div>
  );
}
