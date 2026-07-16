'use client';

import * as React from 'react';

import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { NavUtils } from '~/core/utils/utils';

import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import { ExploreCommentsIcon } from './explore-comments-icon';
import { ExploreJoinSpaceButton } from './explore-join-space-button';

type ExploreFeedCardProps = {
  item: ExploreFeedItem;
  /** Hide the space thumbnail + space-name link in the meta row. Useful when the card is rendered inside the space it references (e.g. the activity tab). */
  hideSpaceLink?: boolean;
  /** Hide the Join button next to the space name. */
  hideJoinButton?: boolean;
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
      <FallbackImage value={image} sizes="24px" className="object-cover" />
    </span>
  );
}

function MetaDot() {
  return <span className="mx-[6px] shrink-0 text-[14px] leading-none text-[#2A2B2E]">·</span>;
}

export function ExploreFeedCard({ item, hideSpaceLink = false, hideJoinButton = false }: ExploreFeedCardProps) {
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
  const timeAgo = formatExploreRelativeTime(item.createdAtSec);

  const entityHref = `${NavUtils.toEntity(item.spaceId, item.entityId)}#entity-comments`;
  const showJoin = !hideJoinButton && !item.isMemberOrEditor;
  const showSpace = !hideSpaceLink;

  const dottedSegments: React.ReactNode[] = [];

  if (showJoin) {
    dottedSegments.push(
      <ExploreJoinSpaceButton
        key="join"
        spaceId={item.spaceId}
        hasRequestedSpaceMembership={item.hasPendingMembershipRequest}
        variant="compact"
        label="Join"
      />
    );
  }

  if (uniqueTypes.length > 0) {
    dottedSegments.push(
      <span
        key="types"
        className="inline-flex min-w-0 flex-wrap items-center text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04"
      >
        {uniqueTypes.map((t, index) => (
          <React.Fragment key={t.id}>
            {index > 0 ? <MetaDot /> : null}
            <span className="truncate">{t.name}</span>
          </React.Fragment>
        ))}
      </span>
    );
  }

  if (timeAgo) {
    dottedSegments.push(
      <span key="time" className="shrink-0 text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04">
        {timeAgo}
      </span>
    );
  }

  return (
    <article className="flex flex-col gap-2 border-b border-divider py-4 last:border-b-0">
      {showSpace || dottedSegments.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center">
          {showSpace ? (
            <Link
              href={NavUtils.toSpace(item.spaceId)}
              className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-text hover:underline"
            >
              <SpaceThumb image={item.spaceImage} name={item.spaceName} />
              <span className="min-w-0 truncate">{item.spaceName}</span>
            </Link>
          ) : null}
          {showSpace && dottedSegments.length > 0 ? <span className="w-1.5 shrink-0" /> : null}
          {dottedSegments.map((segment, index) => (
            <React.Fragment key={index}>
              {index > 0 ? <MetaDot /> : null}
              {segment}
            </React.Fragment>
          ))}
        </div>
      ) : null}

      <div className="flex items-start gap-4">
        {item.imageUrl ? (
          <Link
            href={NavUtils.toEntity(item.spaceId, item.entityId)}
            className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-grey-01"
          >
            <FallbackImage value={item.imageUrl} sizes="120px" className="object-cover" />
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="min-w-0">
            <Link href={NavUtils.toEntity(item.spaceId, item.entityId)}>
              <h2 className="mt-0! text-[19px]! leading-[23px]! font-semibold! tracking-[-0.02em] text-text hover:underline">
                {item.title}
              </h2>
            </Link>
            {item.description ? (
              <p className="mt-1 line-clamp-2 text-[16px]! leading-[20px]! font-normal! tracking-[-0.03em] text-grey-04">
                {item.description}
              </p>
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
        </div>
      </div>
    </article>
  );
}
