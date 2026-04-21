'use client';

import { EntityFeed } from '~/partials/feed/entity-feed';

export function ActivityFeedPage({ spaceId }: { spaceId: string }) {
  return (
    <EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId={spaceId} initialTime="all" showTimeFilter={false} />
  );
}
