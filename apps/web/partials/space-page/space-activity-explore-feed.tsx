'use client';

import * as React from 'react';

import {
  SPACE_ACTIVITY_TYPE_ID,
  type SpaceActivityKind,
  spaceActivityFeedEndpoint,
} from '~/core/space/space-debate-activity';

import { Text } from '~/design-system/text';

import { EntityFeed } from '~/partials/feed/entity-feed';

const HEADING: Record<SpaceActivityKind, string> = {
  debates: 'Debates',
  claims: 'Claims',
};

/**
 * Everything of one kind in one space, as the Explore feed (GEO "see all" from the Overview card).
 *
 * The same infinite-scroll surface Explore is, narrowed twice: to this space, which the endpoint
 * pins rather than the client asking for, and to one entity type. Best by default, because that is
 * what the Overview card ranks its six by and pressing "See all" should continue the list rather
 * than start a different one — the sort menu is still there for a reader who wants New or Top.
 *
 * Not `/space/<id>/debates`, which is the full-bleed video player, and not `/space/<id>/claims`,
 * which is where an editor stages new ones. This is the reading view of both.
 */
export function SpaceActivityExploreFeed({ spaceId, kind }: { spaceId: string; kind: SpaceActivityKind }) {
  // A fixed one-element list, memoised so the feed's query key is stable across renders.
  const lockedTypeIds = React.useMemo(() => [SPACE_ACTIVITY_TYPE_ID[kind]], [kind]);

  return (
    <div className="py-8">
      {/* `h2`, not `h1`: the space header above already carries the page's one — see the claims tab,
          which heads its own list the same way. */}
      <Text as="h2" variant="smallTitle" color="text" className="mb-5 block">
        {HEADING[kind]}
      </Text>

      <EntityFeed
        apiEndpoint={spaceActivityFeedEndpoint(spaceId)}
        lockedSpaceId={spaceId}
        lockedTypeIds={lockedTypeIds}
        initialSort="best"
        showSortFilter
        // "All time" rather than Explore's month: a space holds far less than the whole graph, and a
        // window narrow enough to be interesting across every space can empty a single one.
        initialTime="all"
        // Explore's mobile claim presentation, so a claim here is answerable in the same shape it is
        // on Explore and in the Overview card above it.
        claimCardVariant="debate-panel-mobile"
      />
    </div>
  );
}
