'use client';

import * as React from 'react';

import { useAtomValue } from 'jotai';

import { DEFAULT_EXPLORE_TYPE_IDS, EXPLORE_ENTITY_TYPES } from '~/core/explore/explore-constants';
import type { ExplorePageSort } from '~/core/explore/explore-feed-params';
import { useAwaitedSmartAccount } from '~/core/hooks/use-awaited-smart-account';
import { usePastCallInterleave } from '~/core/space-calls/recording/explore-past-calls';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { useFollowedTopics } from '~/core/topics/use-followed-topics';
import { normId } from '~/core/utils/norm-id';

import { EntityPageSidebarLayout } from '~/partials/entity-page/entity-page-sidebar-layout';
import { EntityFeed } from '~/partials/feed/entity-feed';

import { ExploreEmailCapturePopup } from './email-capture-popup';
import { ExploreLiveLobbiesBanner } from './explore-live-lobbies-banner';
import { ExploreWelcomeBanner } from './explore-welcome-banner';
import { feedTopicsAtom, heldTopicsFor } from '~/atoms/onboarding-feed-topics';

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
  sendIdentityToken: true,
  cdnFirstPage: true,
} satisfies React.ComponentProps<typeof EntityFeed>;

/**
 * GEO-3140. The For you tab for everyone, set per deployment and off unless set. Without it the tab
 * is still reachable through the `forYouFeed` feature flag, for testing before launch.
 */
const FOR_YOU_ENABLED_FOR_EVERYONE = process.env.NEXT_PUBLIC_FOR_YOU_ENABLED === 'true';

/**
 * GEO-3083. Its own component so the follow query only runs with the flag on, and so the feed
 * remounts, opening on For you, when the flag turns on after hydration.
 */
function ExploreForYouFeed({
  walletAddress,
  interleave,
}: {
  walletAddress: string | null;
  interleave: React.ComponentProps<typeof EntityFeed>['interleave'];
}) {
  const { topicIds, isLoading } = useFollowedTopics();
  // Before Privy restores the wallet, the account reads as signed out and the follows as empty.
  // `walletAddress` comes from the httpOnly wallet cookie, so wait for the account rather than serve Best.
  const { smartAccountAddress, awaitingAccount } = useAwaitedSmartAccount(walletAddress !== null);

  // Onboarding picks count as followed while their Interested actions are pending.
  const heldPicks = heldTopicsFor(useAtomValue(feedTopicsAtom), smartAccountAddress);

  const followedTopicIds = React.useMemo(
    () =>
      isLoading || awaitingAccount
        ? null
        : [...new Set([...topicIds, ...heldPicks.map(topic => normId(topic.id))])].sort(),
    [awaitingAccount, isLoading, topicIds, heldPicks]
  );

  return (
    <EntityFeed
      {...EXPLORE_FEED_PROPS}
      initialSort="for-you"
      sortOptions={FOR_YOU_SORT_OPTIONS}
      followedTopicIds={followedTopicIds}
      pendingTopicFollows={heldPicks.length > 0}
      walletAddress={walletAddress}
      interleave={interleave}
    />
  );
}

type Props = {
  /**
   * The rail, rendered by the route as a streamed server component (`ExploreSidePanelContainer`
   * inside Suspense) so its data never holds up the page.
   */
  sidePanel: React.ReactNode;
  /** The wallet cookie the request carried, if any. */
  walletAddress?: string | null;
};

export function ExplorePage({ sidePanel, walletAddress = null }: Props) {
  // GEO-2914. Hidden, not removed: the panel and everything in it is still built and still fed by
  // the route's own queries, so turning the flag on restores it without a deploy — and the tickets
  // still open against its contents have somewhere to land.
  //
  // The layout needs nothing else. `auto-sidebar` widens the container through `has-[aside]:`, so
  // with no `<aside>` rendered the content falls back to the full-width variant on its own rather
  // than holding an empty column open.
  const sidePanelEnabled = useFeatureFlag('exploreSidePanel');
  // GEO-3083. Off, Explore is unchanged: Best, New, Top, opening on Best.
  const forYouFlag = useFeatureFlag('forYouFeed');
  const forYouEnabled = FOR_YOU_ENABLED_FOR_EVERYONE || forYouFlag;
  // GEO-3421. Published past calls between the cards; off, nothing is fetched or drawn.
  const pastCalls = usePastCallInterleave(useFeatureFlag('callRecording'));

  return (
    <EntityPageSidebarLayout sidebar={sidePanelEnabled ? sidePanel : null}>
      {/* Fixed-position, so it sits outside the column rather than in the feed's flow — and ahead
          of it in the DOM, because that is where it is on screen. Mounted after the feed it was
          reachable only by tabbing an infinite list to the end, which for a keyboard reader is not
          reachable at all. It renders nothing until it is shown, so it costs the tab order
          nothing the rest of the time. */}
      <ExploreEmailCapturePopup />
      <main className="min-w-0 pt-2">
        <div className="mx-auto w-full max-w-[880px]">
          <ExploreWelcomeBanner />
          {/* Under the welcome note, which a first-time visitor needs to read before a lobby means
              anything to them; it is dismissed for good, and the lobby banner then leads. */}
          <ExploreLiveLobbiesBanner />
        </div>
        {forYouEnabled ? (
          <ExploreForYouFeed walletAddress={walletAddress} interleave={pastCalls} />
        ) : (
          <EntityFeed {...EXPLORE_FEED_PROPS} initialSort="best" walletAddress={walletAddress} interleave={pastCalls} />
        )}
      </main>
    </EntityPageSidebarLayout>
  );
}
