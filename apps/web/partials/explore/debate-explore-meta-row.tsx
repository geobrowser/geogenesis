'use client';

import * as React from 'react';

import cx from 'classnames';

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
  return (
    <div className="flex items-center justify-between gap-3">
      <div
        // The space side keeps its full width and never wraps: the space name always shows in full,
        // and the Join pill / Debate tag stay shrink-0. The end slot shrinks instead, so the followed
        // topic name is the only label that truncates. (The compact gallery clips to a single line.)
        className={cx('flex flex-nowrap items-center gap-x-2', compact ? 'min-w-0 overflow-hidden' : 'shrink-0')}
      >
        {!hideSpaceLink ? (
          <Link
            href={NavUtils.toSpace(item.spaceId)}
            className="flex items-center gap-1.5 text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-text hover:underline"
          >
            <SpaceThumb image={item.spaceImage} name={item.spaceName} />
            <span className={cx('whitespace-nowrap', compact && 'min-w-0 truncate')}>{item.spaceName}</span>
          </Link>
        ) : null}
        {offer.shown ? <span className="shrink-0">{offer.shown}</span> : null}
        {!compact && !hideTypeTag ? (
          <span className="shrink-0">
            <ExploreTypeTag>Debate</ExploreTypeTag>
          </span>
        ) : null}
      </div>
      {endSlot}
      {offer.mounted}
    </div>
  );
}
