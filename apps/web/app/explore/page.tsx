import * as React from 'react';

import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';
import { parseExploreTime } from '~/core/explore/explore-feed-params';
import { parseExploreTypeIdsParam } from '~/core/explore/explore-type-filter';
import { feedInterleavingEnabled, serveExploreFeedPage } from '~/core/explore/serve-explore-feed-page';
import { QuerySeed, type QuerySeedEntry } from '~/core/query-seed';
import { resolveWithin } from '~/core/utils/resolve-within';

import { ExplorePage } from '~/partials/explore/explore-page';
import { ExploreSidePanelContainer } from '~/partials/explore/explore-side-panel-container';
import { entityFeedQueryKey } from '~/partials/feed/entity-feed-query-key';

/**
 * How long the document waits for the first Best page before streaming the feed without it. Past
 * this the browser asks for the page itself, as it always did; the slow request this gives up on
 * is the one the browser would have waited on anyway.
 */
const BEST_FEED_SEED_TIMEOUT_MS = 2_500;

/**
 * The first Best page, rendered into the HTML under the key the feed's first request would use, so
 * the cards — and the debate, media and video lookups they start — no longer wait for the bundle
 * to hydrate and then for `/api/explore/feed`. That chain put the first card's video about 2s into
 * a cold load (`explore-feed` was 1.5→2.0s of it).
 *
 * Empty, so the browser fetches the page as before, when:
 *  - the page can't be built in time, or fails;
 *  - it carries seen demotion (GEO-3234), which the browser applies from this visitor's own
 *    history, so the server's render of it could disagree with the browser's first one.
 */
async function bestFirstPageSeed(): Promise<QuerySeedEntry[]> {
  const page = await resolveWithin(
    () =>
      serveExploreFeedPage(
        {
          pageSort: 'best',
          // What the route reads from a Best request, which sends no range.
          time: parseExploreTime(null),
          spaceIdsParam: null,
          cursor: null,
          typeIds: parseExploreTypeIdsParam(null),
          followedTopicIdsParam: null,
        },
        // Only a signed-in reader with interleaving on is personalized on Best, and that reader
        // isn't seeded (see the route below).
        async () => null
      ).catch(() => null),
    BEST_FEED_SEED_TIMEOUT_MS,
    null
  );
  if (!page || page.body.seenDemotion) return [];

  return [
    {
      // As `EXPLORE_FEED_PROPS` asks on arrival: Best, which sends no time range, no filters, and
      // no account yet (Privy restores it after hydration, and that key fetches for itself).
      queryKey: entityFeedQueryKey({
        apiEndpoint: '/api/explore/feed',
        sort: 'best',
        time: undefined,
        spaceIdsKey: '',
        typeIdsKey: null,
        topicIdsKey: '',
        fixedParamsKey: '',
        smartAccountAddress: null,
        followedTopicIdsKey: '',
      }),
      data: { pages: [page.body], pageParams: [undefined] },
    },
  ];
}

async function SeededExplorePage({ sidePanel, signedIn }: { sidePanel: React.ReactNode; signedIn: boolean }) {
  const entries = await bestFirstPageSeed();
  const page = <ExplorePage sidePanel={sidePanel} signedIn={signedIn} />;
  return entries.length > 0 ? <QuerySeed entries={entries}>{page}</QuerySeed> : page;
}

export default async function ExploreRoutePage() {
  const wallet = (await cookies()).get(WALLET_ADDRESS)?.value;
  const signedIn = wallet !== undefined;
  // The rail streams in behind its own boundary: nothing in it is above the fold, and awaiting it
  // here held the whole document — feed shell, CSS and JS requests — until its slowest call landed.
  const sidePanel = (
    <React.Suspense fallback={null}>
      <ExploreSidePanelContainer />
    </React.Suspense>
  );

  // Seeded only where Explore opens on Best for a request we can make here. For you opens on
  // something else, and a signed-in reader's Best carries an identity token while interleaving is on,
  // which this render can't send.
  const seedsBest = process.env.NEXT_PUBLIC_FOR_YOU_ENABLED !== 'true' && !(signedIn && feedInterleavingEnabled());
  if (!seedsBest) return <ExplorePage sidePanel={sidePanel} signedIn={signedIn} />;

  // The feed waits on its first page behind a boundary of its own, so the shell, CSS and JS still
  // leave at once. The fallback is the unseeded page, drawn but never hydrated: its skeleton holds
  // the space until the seeded page streams in.
  return (
    <React.Suspense fallback={<ExplorePage sidePanel={null} signedIn={signedIn} />}>
      <SeededExplorePage sidePanel={sidePanel} signedIn={signedIn} />
    </React.Suspense>
  );
}
