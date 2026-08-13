'use client';

import { DebatesBrowseFeed } from '~/core/debates/browse/debate-feed';

type DebatesPageClientProps = {
  spaceId: string;
};

export function DebatesPageClient({ spaceId }: DebatesPageClientProps) {
  return <DebatesBrowseFeed spaceId={spaceId} />;
}
