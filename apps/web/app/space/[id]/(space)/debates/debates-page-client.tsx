'use client';

import * as React from 'react';

import { DebatesBrowseFeed } from '~/core/debates/browse/debate-feed';
import { DEBATE_FEED_PARAM } from '~/core/debates/browse/debate-feed-url';

type DebatesPageClientProps = {
  spaceId: string;
};

export function DebatesPageClient({ spaceId }: DebatesPageClientProps) {
  // The feed writes the debate on screen into `?debate=` as the viewer scrolls, so a reload or a
  // copied link opens on that debate. Read once, at mount, from the URL itself rather than through
  // `useSearchParams`: the feed rewrites the param on every swipe, and an anchor that followed it
  // would hoist each debate to the top as the viewer reached it.
  const [initialDebateId] = React.useState(() =>
    typeof window === 'undefined'
      ? undefined
      : (new URLSearchParams(window.location.search).get(DEBATE_FEED_PARAM) ?? undefined)
  );

  return <DebatesBrowseFeed spaceId={spaceId} initialDebateId={initialDebateId} surface="debates-tab" />;
}
