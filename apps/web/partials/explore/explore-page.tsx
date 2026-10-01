'use client';

import * as React from 'react';

import type { ExploreCall } from '~/core/community-calls/fetch-community-calls';
import { DEFAULT_EXPLORE_TYPE_IDS, EXPLORE_ENTITY_TYPES } from '~/core/explore/explore-constants';
import type { ExplorePageSort } from '~/core/explore/explore-feed-params';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import type { FeaturedRanking } from '~/core/io/subgraph/fetch-featured-rankings';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { useFollowedTopics } from '~/core/topics/use-followed-topics';

import { EntityPageSidebarLayout } from '~/partials/entity-page/entity-page-sidebar-layout';
import { EntityFeed } from '~/partials/feed/entity-feed';

import { ExploreEmailCapturePopup } from './email-capture-popup';
import { ExploreSidePanel } from './explore-side-panel';
import { ExploreWelcomeBanner } from './explore-welcome-banner';

/** Bounds the wait for a signed-in account, so a stale wallet cookie can't hold the skeleton up. */
const FOR_YOU_ACCOUNT_WAIT_MS = 5_000;

const FOR_YOU_SORT_OPTIONS: readonly ExplorePageSort[] = ['for-you', 'best', 'top', 'new'];

// No space or type menus up front: the feed spans every space the reader may see and holds
// Explore's default types (Debate and Claim — see `DEFAULT_EXPLORE_TYPE_IDS`). "More filters" in the
// sort menu reveals both for readers who want to narrow or widen it.
const EXPLORE_FEED_PROPS = {
  apiEndpoint: '/api/explore/feed',
  initialTime: 'month',
  showSortFilter: true,
  showMoreFilters: true,
  typeOptions: EXPLORE_ENTITY_TYPES,
  initialTypeIds: DEFAULT_EXPLORE_TYPE_IDS,
  compactHeader: true,
  dividerBeforeFeed: true,
  titleOpensSidePanel: true,
  claimCardVariant: 'debate-panel-mobile',
  feedTopSpacingClassName: '',
} satisfies React.ComponentProps<typeof EntityFeed>;

/**
 * GEO-3083. Its own component so the follow query only runs with the flag on, and so the feed
 * remounts, opening on For you, when the flag turns on after hydration.
 */
function ExploreForYouFeed({ signedIn }: { signedIn: boolean }) {
  const { topicIds, isLoading } = useFollowedTopics();
  // Before Privy restores the wallet, the account reads as signed out and the follows as empty.
  // `signedIn` comes from the httpOnly wallet cookie, so wait for the account rather than serve Best.
  const { smartAccount } = useSmartAccount();
  const [accountWaitOver, setAccountWaitOver] = React.useState(false);
  const awaitingAccount = signedIn && !smartAccount && !accountWaitOver;
  React.useEffect(() => {
    if (!awaitingAccount) return;
    const timer = setTimeout(() => setAccountWaitOver(true), FOR_YOU_ACCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, [awaitingAccount]);

  const followedTopicIds = React.useMemo(
    () => (isLoading || awaitingAccount ? null : [...topicIds].sort()),
    [awaitingAccount, isLoading, topicIds]
  );

  return (
    <EntityFeed
      {...EXPLORE_FEED_PROPS}
      initialSort="for-you"
      sortOptions={FOR_YOU_SORT_OPTIONS}
      followedTopicIds={followedTopicIds}
    />
  );
}

type Props = {
  featuredSpaces: FeaturedSpace[];
  featuredRankings: FeaturedRanking[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
  communityCalls: ExploreCall[];
  /** Whether the request carried a wallet cookie. */
  signedIn?: boolean;
};

export function ExplorePage({
  featuredSpaces,
  featuredRankings,
  pendingMembershipSpaceIds,
  memberOrEditorSpaceIds,
  communityCalls,
  signedIn = false,
}: Props) {
  // GEO-2914. Hidden, not removed: the panel and everything in it is still built and still fed by
  // the page's own queries, so turning the flag on restores it without a deploy — and the tickets
  // still open against its contents have somewhere to land.
  //
  // The layout needs nothing else. `auto-sidebar` widens the container through `has-[aside]:`, so
  // with no `<aside>` rendered the content falls back to the full-width variant on its own rather
  // than holding an empty column open.
  const sidePanelEnabled = useFeatureFlag('exploreSidePanel');
  // GEO-3083. Off, Explore is unchanged: Best, New, Top, opening on Best.
  const forYouEnabled = useFeatureFlag('forYouFeed');

  return (
    <EntityPageSidebarLayout
      sidebar={
        sidePanelEnabled ? (
          <ExploreSidePanel
            featuredSpaces={featuredSpaces}
            featuredRankings={featuredRankings}
            pendingMembershipSpaceIds={pendingMembershipSpaceIds}
            memberOrEditorSpaceIds={memberOrEditorSpaceIds}
            communityCalls={communityCalls}
          />
        ) : null
      }
    >
      {/* Fixed-position, so it sits outside the column rather than in the feed's flow — and ahead
          of it in the DOM, because that is where it is on screen. Mounted after the feed it was
          reachable only by tabbing an infinite list to the end, which for a keyboard reader is not
          reachable at all. It renders nothing until it is shown, so it costs the tab order
          nothing the rest of the time. */}
      <ExploreEmailCapturePopup />
      <main className="min-w-0 pt-2">
        <div className="mx-auto w-full max-w-[880px]">
          <ExploreWelcomeBanner />
        </div>
        {forYouEnabled ? (
          <ExploreForYouFeed signedIn={signedIn} />
        ) : (
          <EntityFeed {...EXPLORE_FEED_PROPS} initialSort="best" />
        )}
      </main>
    </EntityPageSidebarLayout>
  );
}
