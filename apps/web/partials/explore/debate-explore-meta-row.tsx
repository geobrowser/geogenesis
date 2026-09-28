'use client';

import * as React from 'react';

import cx from 'classnames';

import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreJoinSpaceButton } from './explore-join-space-button';
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
  endSlot,
}: {
  item: ExploreFeedItem;
  hideSpaceLink?: boolean;
  hideJoinButton?: boolean;
  compact?: boolean;
  endSlot?: React.ReactNode;
}) {
  const timeAgo = formatExploreRelativeTime(item.createdAtSec);

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
        {!hideJoinButton && !item.isMemberOrEditor ? (
          <ExploreJoinSpaceButton
            spaceId={item.spaceId}
            hasRequestedSpaceMembership={item.hasPendingMembershipRequest}
            variant="pill"
            label="Join"
          />
        ) : null}
        {!compact ? (
          <span className="rounded-[4px] bg-grey-01 px-1.5 py-0.5 text-[12px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04">
            Debate
          </span>
        ) : null}
        <span className="shrink-0 text-[12px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04">
          {timeAgo}
        </span>
      </div>
      {endSlot}
    </div>
  );
}
