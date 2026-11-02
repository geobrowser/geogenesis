import * as React from 'react';

import type { SaveVotesPressReason } from '~/core/state/save-votes-prompt';
import { NavUtils } from '~/core/utils/utils';

import { GeoMark } from '~/design-system/icons/geo-mark';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

/** The Geo lockup shared by the mobile Explore navbar and the fullscreen debate bar. */
export function MobileNavbarBrand({ placement }: { placement: SaveVotesPressReason }) {
  return (
    <Link
      href={NavUtils.toExplore()}
      data-geo-analytics-label={placement === 'debate_feed_bar' ? 'Debate feed bar Geo logo' : 'Geo logo'}
      data-geo-analytics-intent="navigate_explore"
      className="-ml-1 flex h-11 items-center gap-1.5 px-1 text-text"
    >
      <span aria-hidden className="flex">
        <GeoMark size={20} />
      </span>
      <span className="font-[family-name:var(--font-geist-medium)] text-[26px] leading-none">Geo</span>
    </Link>
  );
}
