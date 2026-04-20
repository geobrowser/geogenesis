'use client';

import * as React from 'react';

import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import { NavUtils } from '~/core/utils/utils';

import Image from 'next/image';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { getImagePath, getImagePathFallback } from '~/core/utils/utils';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ExploreCommentsIcon } from './explore-comments-icon';
import { ExploreJoinSpaceButton } from './explore-join-space-button';

type ExploreFeedCardProps = {
  item: ExploreFeedItem;
};

/**
 * Loads the image through Next.js optimizer (fast path, ~2-3 KB webp), with fallbacks
 * that stay on the primary gateway (Pinata) as long as possible — most images live there.
 * Lighthouse is only tried as a last resort for legacy CIDs that migrated off Pinata.
 *
 * Stages, in order:
 *   1. Pinata + Next optimizer (fast, works for most raster images)
 *   2. Pinata unoptimized (bypasses Next's server fetch — handles SVGs without
 *      `dangerouslyAllowSVG`, and timeouts where browser can still reach Pinata fine)
 *   3. Lighthouse unoptimized (legacy CIDs not on Pinata)
 */
function FallbackImage({ value, sizes, className }: { value: string; sizes: string; className?: string }) {
  const [stage, setStage] = React.useState<'primary' | 'primary-unoptimized' | 'lighthouse-unoptimized'>('primary');

  const src =
    stage === 'lighthouse-unoptimized' ? getImagePathFallback(value) : getImagePath(value);
  const unoptimized = stage !== 'primary';

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      className={className}
      unoptimized={unoptimized}
      onError={() => {
        setStage(prev => {
          if (prev === 'primary') return 'primary-unoptimized';
          if (prev === 'primary-unoptimized' && value.startsWith('ipfs://')) return 'lighthouse-unoptimized';
          return prev;
        });
      }}
    />
  );
}

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
      <FallbackImage value={image} sizes="24px" className="object-cover" />
    </span>
  );
}

export function ExploreFeedCard({ item }: ExploreFeedCardProps) {
  const uniqueTypes = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const t of item.types) {
      if (!t.name) continue;
      const key = t.id.replace(/-/g, '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: t.id, name: t.name });
    }
    return out;
  }, [item.types]);
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
          {uniqueTypes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
              {uniqueTypes.map(t => (
                <span
                  key={t.id}
                  className="rounded-[4px] bg-grey-01 px-1.5 py-0.5 text-[12px] font-normal leading-[13px] tracking-[-0.35px] text-grey-04"
                >
                  {t.name}
                </span>
              ))}
            </div>
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

      <div className={`flex gap-10 ${item.description ? 'items-start' : 'items-center'}`}>
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
            <FallbackImage value={item.imageUrl} sizes="186px" className="object-cover" />
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
