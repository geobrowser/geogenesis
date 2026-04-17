'use client';

import * as React from 'react';

import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import { NavUtils } from '~/core/utils/utils';

import { ThumbGeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ExploreCommentsIcon } from './explore-comments-icon';
import { ExploreJoinSpaceButton } from './explore-join-space-button';

type ExploreFeedCardProps = {
  item: ExploreFeedItem;
};

function SpaceThumb({ image, name }: { image: string | null; name: string }) {
  if (!image) {
    const initial = name.trim().slice(0, 1).toUpperCase() || '?';
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-grey-01 text-[10px] font-medium text-grey-04 ring-1 ring-inset ring-grey-02/40">
        {initial}
      </span>
    );
  }
  return (
    <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md bg-grey-01">
      <ThumbGeoImage value={image} alt="" className="h-full w-full object-cover" />
    </span>
  );
}

export function ExploreFeedCard({ item }: ExploreFeedCardProps) {
  const typeLabel = item.types
    .filter(t => t.name)
    .map(t => t.name)
    .join(' · ');
  const edited = formatExploreRelativeTime(item.updatedAtSec);

  const entityHref = `${NavUtils.toEntity(item.spaceId, item.entityId)}#entity-comments`;

  return (
    <article className="border-b border-divider py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-browseMenu text-grey-04">
          <Link href={NavUtils.toSpace(item.spaceId)} className="flex min-w-0 items-center gap-1.5 hover:text-text">
            <SpaceThumb image={item.spaceImage} name={item.spaceName} />
            <span className="min-w-0 truncate font-normal text-text">{item.spaceName}</span>
          </Link>
          {typeLabel ? <span className="hidden sm:inline">· {typeLabel}</span> : null}
          {item.isNewPost ? (
            <span className="rounded border border-grey-02 bg-grey-01 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-grey-04">
              New post
            </span>
          ) : null}
          <span>{edited}</span>
        </div>
        {!item.isMemberOrEditor ? (
          <ExploreJoinSpaceButton
            spaceId={item.spaceId}
            hasRequestedSpaceMembership={item.hasPendingMembershipRequest}
          />
        ) : null}
      </div>

      <div className="mt-2 flex gap-4">
        <div className="min-w-0 flex-1">
          <Link href={NavUtils.toEntity(item.spaceId, item.entityId)}>
            <Text as="h2" variant="bodySemibold" className="text-text hover:underline">
              {item.title}
            </Text>
          </Link>
          {item.description ? (
            <p className="mt-1 line-clamp-3 text-browseMenu font-normal text-grey-04">{item.description}</p>
          ) : null}
        </div>
        {item.imageUrl ? (
          <Link
            href={NavUtils.toEntity(item.spaceId, item.entityId)}
            className="relative mt-1 h-[88px] w-[120px] shrink-0 overflow-hidden rounded-md bg-grey-01 ring-1 ring-inset ring-grey-02/40"
          >
            <ThumbGeoImage value={item.imageUrl} alt="" className="h-full w-full object-cover" />
          </Link>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-6">
        <EntityVoteButtons entityId={item.entityId} spaceId={item.spaceId} />
        <Link
          href={entityHref}
          className="inline-flex items-center gap-1.5 text-grey-04 transition-colors hover:text-text"
        >
          <ExploreCommentsIcon className="text-grey-04" />
          <span className="text-smallButton tabular-nums">{item.commentCount}</span>
        </Link>
      </div>
    </article>
  );
}
