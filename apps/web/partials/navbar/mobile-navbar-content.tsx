'use client';

import * as React from 'react';

import dynamic from 'next/dynamic';

import { useMediaQuery } from '~/core/hooks/use-media-query';
import { SaveVotesPressReason } from '~/core/state/save-votes-prompt';
import { NavUtils } from '~/core/utils/utils';

import { GeoMark } from '~/design-system/icons/geo-mark';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

const MobileNavbarActions = dynamic(
  () => import('./mobile-navbar-actions').then(m => ({ default: m.MobileNavbarActions })),
  { ssr: false }
);

/** The shared phone navigation for Explore and the fullscreen debate feed. */
export function MobileNavbarContent({ signInComponent }: { signInComponent: SaveVotesPressReason }) {
  // CSS hides the bar on desktop; avoid mounting a second set of account controls there.
  const isPhone = useMediaQuery('(max-width: 767px)');

  return (
    <>
      <Link
        href={NavUtils.toExplore()}
        data-geo-analytics-label={signInComponent === 'debate_feed_bar' ? 'Debate feed bar Geo logo' : 'Geo logo'}
        data-geo-analytics-intent="navigate_explore"
        className="-ml-1 flex h-11 items-center gap-1.5 px-1 text-text"
      >
        <span aria-hidden className="flex">
          <GeoMark size={20} />
        </span>
        <span className="font-[family-name:var(--font-geist-medium)] text-[26px] leading-none">Geo</span>
      </Link>
      {isPhone ? <MobileNavbarActions signInComponent={signInComponent} /> : null}
    </>
  );
}
