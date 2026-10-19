import * as React from 'react';

import { cookies } from 'next/headers';
import { preload } from 'react-dom';

import { WALLET_ADDRESS } from '~/core/cookie';
import { PUBLIC_BEST_FEED_PATH } from '~/core/explore/explore-feed-params';
import { readLeadPosterUrls } from '~/core/explore/lead-poster-preload';

import { ExplorePage } from '~/partials/explore/explore-page';
import { ExploreSidePanelContainer } from '~/partials/explore/explore-side-panel-container';

/**
 * The request the Best feed makes on mount (`fetchFeedPage`, credentials included): the CDN-cached
 * anonymous URL for a signed-out reader, the personal one for a signed-in reader. The href must
 * match the feed's own URL exactly or the browser runs the request twice. The client can't send it
 * until the whole bundle, Privy and wagmi among it, has downloaded and hydrated, about 2s into a cold load. Preloading it from the HTML starts it on
 * first parse, and the feed's own `fetch` adopts the in-flight response. Skipped when For you opens
 * the page, which asks for something else.
 */
const SIGNED_IN_BEST_FEED_PRELOAD_HREF = '/api/explore/feed?sort=best';

/**
 * The lead card's stills, preloaded from the document for a signed-out reader (GEO-3280). Renders
 * nothing; it sits behind its own boundary so its bounded read streams in after the shell and never
 * holds it. The hrefs are the card's own `src`s, so the `<img>`s take the preloaded responses.
 */
async function LeadPosterPreload() {
  const [first, ...rest] = await readLeadPosterUrls();
  if (first) preload(first, { as: 'image', fetchPriority: 'high' });
  for (const href of rest) preload(href, { as: 'image' });
  return null;
}

export default async function ExploreRoutePage() {
  const wallet = (await cookies()).get(WALLET_ADDRESS)?.value;
  // A signed-in reader's Best request carries an identity token while interleaving is on, and a
  // preload can't send one, so the feed's fetch would ignore it and the request would run twice.
  const bestSendsIdentityToken = wallet !== undefined && process.env.NEXT_PUBLIC_FEED_INTERLEAVING_ENABLED === 'true';
  const opensOnBest = process.env.NEXT_PUBLIC_FOR_YOU_ENABLED !== 'true';
  if (opensOnBest && !bestSendsIdentityToken) {
    preload(wallet === undefined ? PUBLIC_BEST_FEED_PATH : SIGNED_IN_BEST_FEED_PRELOAD_HREF, {
      as: 'fetch',
      crossOrigin: 'use-credentials',
    });
  }

  // The rail streams in behind its own boundary: nothing in it is above the fold, and awaiting it
  // here held the whole document — feed shell, CSS and JS requests — until its slowest call landed.
  return (
    <>
      <ExplorePage
        sidePanel={
          <React.Suspense fallback={null}>
            <ExploreSidePanelContainer />
          </React.Suspense>
        }
        walletAddress={wallet || null}
      />
      {opensOnBest && wallet === undefined ? (
        <React.Suspense fallback={null}>
          <LeadPosterPreload />
        </React.Suspense>
      ) : null}
    </>
  );
}
