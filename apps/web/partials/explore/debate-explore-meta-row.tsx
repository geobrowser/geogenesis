'use client';

import * as React from 'react';

import cx from 'classnames';

import { TrendingTag } from '~/core/claims/browse/claim-summary';
import { useIsTrending } from '~/core/debates/todays-claims/trending';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { useSpaceOffer } from './explore-meta-row';
import { ExploreTypeTag } from './explore-type-tag';
import { SpaceThumb } from './space-thumb';

/**
 * The metadata shared by playable debates and their generic fallback rendition.
 * Keeping it here prevents an unprocessed debate from changing chrome when its player is replaced.
 */
export function DebateExploreMetaRow({
  item,
  hideSpaceLink = false,
  hideJoinButton = false,
  compact = false,
  hideTypeTag = false,
  endSlot,
}: {
  item: ExploreFeedItem;
  hideSpaceLink?: boolean;
  hideJoinButton?: boolean;
  compact?: boolean;
  /** Leave out the "Debate" tag: the playable card's shape says what it is (GEO-3454). */
  hideTypeTag?: boolean;
  endSlot?: React.ReactNode;
}) {
  const offer = useSpaceOffer(item, { hidden: hideJoinButton, joinVariant: 'pill' });
  // GEO-3497. gaia answers a debate's `lastListedOn` with its claim's, so the debate's own id is
  // enough, and the tag shows whenever the debate was recorded.
  const isTrending = useIsTrending(item.entityId);
  return (
    <div className="flex items-center justify-between gap-3">
      <div
        className={cx(
          'flex min-w-0 items-center gap-x-2',
          compact ? 'flex-nowrap overflow-hidden' : 'flex-wrap gap-y-1'
        )}
      >
        {!hideSpaceLink ? (
          <Link
            href={NavUtils.toSpace(item.spaceId)}
            className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-text hover:underline"
          >
            <SpaceThumb image={item.spaceImage} name={item.spaceName} />
            <span className="min-w-0 truncate">{item.spaceName}</span>
          </Link>
        ) : null}
        {isTrending ? <TrendingTag /> : null}
        {offer.shown}
        {!compact && !hideTypeTag ? <ExploreTypeTag>Debate</ExploreTypeTag> : null}
      </div>
      {endSlot}
      {offer.mounted}
    </div>
  );
}
