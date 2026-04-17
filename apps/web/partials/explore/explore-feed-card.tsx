'use client';

import * as React from 'react';

import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

// Append Pinata image-optimization query params so thumbnails load as small, webp-encoded versions
// (gateway advertises `image-resize: true`). Only transforms resolved http(s) URLs.
function thumbSrc(value: string, width: number, height: number): string {
  const base = getImagePath(value);
  if (!base.startsWith('http')) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}img-width=${width * 2}&img-height=${height * 2}&img-fit=cover&img-format=auto&img-quality=80`;
}

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
      <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-[4px] bg-grey-01 text-[8px] font-medium text-grey-04">
        {initial}
      </span>
    );
  }
  return (
    <span className="relative h-3 w-3 shrink-0 overflow-hidden rounded-[4px] bg-grey-01">
      <img src={thumbSrc(image, 12, 12)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} />
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
    <article className="flex flex-col gap-2 border-b border-divider py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={NavUtils.toSpace(item.spaceId)}
            className="flex min-w-0 items-center gap-1.5 text-[14px] font-normal leading-[13px] tracking-[-0.35px] text-text hover:underline"
          >
            <SpaceThumb image={item.spaceImage} name={item.spaceName} />
            <span className="min-w-0 truncate">{item.spaceName}</span>
          </Link>
          {typeLabel ? (
            <span className="rounded-[4px] bg-grey-01 px-1.5 py-0.5 text-[12px] font-normal leading-[13px] tracking-[-0.35px] text-grey-04">
              {typeLabel}
            </span>
          ) : null}
          <span className="text-[12px] font-normal leading-[13px] tracking-[-0.35px] text-grey-04">{edited}</span>
        </div>
        {!item.isMemberOrEditor ? (
          <ExploreJoinSpaceButton
            spaceId={item.spaceId}
            hasRequestedSpaceMembership={item.hasPendingMembershipRequest}
          />
        ) : null}
      </div>

      <div className="flex items-start gap-10">
        <div className="min-w-0 flex-1">
          <Link href={NavUtils.toEntity(item.spaceId, item.entityId)}>
            <h2 className="text-[19px] font-semibold leading-[23px] tracking-[-0.02em] text-text hover:underline">
              {item.title}
            </h2>
          </Link>
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-[16px] font-normal leading-[20px] tracking-[-0.03em] text-grey-04">
              {item.description}
            </p>
          ) : null}
        </div>
        {item.imageUrl ? (
          <Link
            href={NavUtils.toEntity(item.spaceId, item.entityId)}
            className="relative h-[40px] w-[93px] shrink-0 overflow-hidden rounded-lg bg-grey-01"
          >
            <img
              src={thumbSrc(item.imageUrl, 93, 40)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </Link>
        ) : null}
      </div>

      <div className="flex items-center gap-6">
        <EntityVoteButtons entityId={item.entityId} spaceId={item.spaceId} />
        <Link
          href={entityHref}
          className="inline-flex items-center gap-1.5 text-grey-04 transition-colors hover:text-text"
        >
          <ExploreCommentsIcon className="text-grey-04" />
          <span className="text-[14px] font-normal tabular-nums">{item.commentCount}</span>
        </Link>
      </div>
    </article>
  );
}
