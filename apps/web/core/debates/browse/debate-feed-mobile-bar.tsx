'use client';

import * as React from 'react';

import dynamic from 'next/dynamic';

import { NavUtils } from '~/core/utils/utils';

import { GeoMark } from '~/design-system/icons/geo-mark';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

// Client-only, like the navbar's own account controls: they read Privy, and the feed renders in tests
// and on first paint without it.
const DebateFeedMobileBarActions = dynamic(
  () => import('./debate-feed-mobile-bar-actions').then(m => ({ default: m.DebateFeedMobileBarActions })),
  { ssr: false }
);

/**
 * The phone-only bar over the full-screen debate feed (GEO-3415). The feed covers the app navbar on
 * phones, which left a visitor from a shared link with no way to the rest of Geo and no way to sign
 * in. This is the minimum that fixes that: the Geo lockup to Explore, and the account controls.
 *
 * The lockup is the share video's: the same mark, and "Geo" in Geist Medium rather than Calibre, so a
 * screenshot of the feed carries the brand the way the video does.
 */
export function DebateFeedMobileBar() {
  return (
    <header className="hidden h-11 shrink-0 items-center justify-between bg-white px-4 md:flex">
      <Link
        href={NavUtils.toExplore()}
        data-geo-analytics-label="Debate feed bar Geo logo"
        data-geo-analytics-intent="navigate_explore"
        className="-ml-1 flex h-11 items-center gap-1.5 px-1 text-text"
      >
        <span aria-hidden className="flex">
          <GeoMark size={20} />
        </span>
        <span className="font-[family-name:var(--font-geist-medium)] text-[26px] leading-none">Geo</span>
      </Link>
      <DebateFeedMobileBarActions />
    </header>
  );
}
