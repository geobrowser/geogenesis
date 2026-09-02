'use client';

import * as React from 'react';

import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { RANKING_BLOCK_TYPE_ID } from '~/core/ranking-block-ids';
import { normId } from '~/core/utils/norm-id';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreJoinSpaceButton } from './explore-join-space-button';
import { MetaDot } from './meta-dot';
import { SpaceThumb } from './space-thumb';

const RANKING_BLOCK_TYPE = normId(RANKING_BLOCK_TYPE_ID);

const SEGMENT_CLASS = 'text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04';

/**
 * The line above every explore card: the space, what the thing is, and when it appeared.
 *
 * One component because two card types draw it and a third could. It was copied rather than shared
 * when the claim card was written, and the copy did not survive contact: the segments ended up a
 * different distance apart, three of them lost `font-normal`, and a `min-h` added to reserve room
 * for the end slot held every claim card eight pixels taller than the cards either side of it.
 * None of that is visible in a diff of the two files — it took reading them class by class, twice.
 *
 * The dots live between segments rather than as a `gap`, because a segment that is absent must not
 * leave a separator behind: a claim with no timestamp ends after its type, not after a dot.
 */
export function ExploreMetaRow({
  item,
  hideSpaceLink = false,
  hideJoinButton = false,
  extraSegments,
  endSlot,
  className,
}: {
  item: ExploreFeedItem;
  hideSpaceLink?: boolean;
  hideJoinButton?: boolean;
  /**
   * Segments this card adds, placed after the types and before the timestamp.
   *
   * Where a claim card puts Controversial — beside what kind of thing this is, which is the same
   * question, rather than down in the verdict where it would read as part of the number.
   */
  extraSegments?: React.ReactNode[];
  /**
   * Pinned to the end of the row with `ml-auto`, outside the dotted run.
   *
   * The claim card's offer, which is an action rather than another fact about the claim — so it
   * takes no dot before it.
   */
  endSlot?: React.ReactNode;
  className?: string;
}) {
  // Deduped by normalized id and named only where the type has a name — an unnamed one renders as a
  // raw id, which says less than nothing.
  const types = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const type of item.types) {
      if (!type.name) continue;
      const key = normId(type.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: type.id, name: key === RANKING_BLOCK_TYPE ? 'Ranking' : type.name });
    }
    return out;
  }, [item.types]);

  const timeAgo = formatExploreRelativeTime(item.createdAtSec);

  const segments: React.ReactNode[] = [];

  if (!hideJoinButton && !item.isMemberOrEditor) {
    segments.push(
      <ExploreJoinSpaceButton
        key="join"
        spaceId={item.spaceId}
        hasRequestedSpaceMembership={item.hasPendingMembershipRequest}
        variant="compact"
        label="Join"
      />
    );
  }

  if (types.length > 0) {
    segments.push(
      <span key="types" className={`inline-flex min-w-0 flex-wrap items-center ${SEGMENT_CLASS}`}>
        {types.map((type, index) => (
          <React.Fragment key={type.id}>
            {index > 0 ? <MetaDot /> : null}
            <span className="truncate">{type.name}</span>
          </React.Fragment>
        ))}
      </span>
    );
  }

  if (extraSegments) segments.push(...extraSegments);

  if (timeAgo) {
    segments.push(
      <span key="time" className={`shrink-0 ${SEGMENT_CLASS}`}>
        {timeAgo}
      </span>
    );
  }

  const showSpace = !hideSpaceLink;
  if (!showSpace && segments.length === 0 && !endSlot) return null;

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-y-2 ${className ?? ''}`}>
      {showSpace ? (
        <Link
          href={NavUtils.toSpace(item.spaceId)}
          className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-text hover:underline"
        >
          <SpaceThumb image={item.spaceImage} name={item.spaceName} />
          <span className="min-w-0 truncate">{item.spaceName}</span>
        </Link>
      ) : null}
      {/* A 6px spacer rather than a dot: the space is the row's subject, not one of its facts. */}
      {showSpace && segments.length > 0 ? <span className="w-1.5 shrink-0" /> : null}
      {segments.map((segment, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <MetaDot /> : null}
          {segment}
        </React.Fragment>
      ))}
      {endSlot}
    </div>
  );
}
