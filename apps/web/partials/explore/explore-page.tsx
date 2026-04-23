'use client';

import { EntityFeed, type SpaceOption } from '~/partials/feed/entity-feed';

export function ExplorePage({ initialSpaceOptions }: { initialSpaceOptions: SpaceOption[] }) {
  return <EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={initialSpaceOptions} />;
}
