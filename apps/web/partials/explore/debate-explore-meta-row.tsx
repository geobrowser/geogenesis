'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreJoinSpaceButton } from './explore-join-space-button';
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
  endSlot,
}: {
  item: ExploreFeedItem;
  hideSpaceLink?: boolean;
  hideJoinButton?: boolean;
  compact?: boolean;
  endSlot?: React.ReactNode;
}) {
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
        {!compact ? <ExploreTypeTag>Debate</ExploreTypeTag> : null}
      </div>
      {endSlot}
    </div>
  );
}
