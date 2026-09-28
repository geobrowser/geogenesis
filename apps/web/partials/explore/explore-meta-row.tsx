'use client';

import * as React from 'react';

import cx from 'classnames';

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

/**
 * The type of one metadata segment.
 *
 * Exported because the topic card draws a second line of metadata under the description and it has
 * to be the same type as this row. Spelling it out there instead is precisely how the claim card's
 * copy of this row lost `font-normal` on three segments without any diff showing it.
 */
export const META_SEGMENT_CLASS = 'text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04';

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
  compactOnMobile = false,
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
  /** On mobile, keep only the space and caller-supplied segments, matching the debates card. */
  compactOnMobile?: boolean;
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

  const segments: { key: string; content: React.ReactNode; showOnCompactMobile: boolean }[] = [];

  if (!hideJoinButton && !item.isMemberOrEditor) {
    segments.push({
      key: 'join',
      // Joining is behaviour, not metadata. Compacting the row must never remove an action the
      // ordinary Explore card offers; only the Claim type and age disappear on mobile.
      showOnCompactMobile: true,
      content: (
        <ExploreJoinSpaceButton
          spaceId={item.spaceId}
          hasRequestedSpaceMembership={item.hasPendingMembershipRequest}
          variant="compact"
          label="Join"
        />
      ),
    });
  }

  if (types.length > 0) {
    segments.push({
      key: 'types',
      showOnCompactMobile: false,
      content: (
        <span className={`inline-flex min-w-0 flex-wrap items-center ${META_SEGMENT_CLASS}`}>
          {types.map((type, index) => (
            <React.Fragment key={type.id}>
              {index > 0 ? <MetaDot /> : null}
              <span className="truncate">{type.name}</span>
            </React.Fragment>
          ))}
        </span>
      ),
    });
  }

  extraSegments?.forEach((content, index) => {
    segments.push({ key: `extra-${index}`, content, showOnCompactMobile: true });
  });

  if (timeAgo) {
    segments.push({
      key: 'time',
      showOnCompactMobile: false,
      content: <span className={`shrink-0 ${META_SEGMENT_CLASS}`}>{timeAgo}</span>,
    });
  }

  const showSpace = !hideSpaceLink;
  if (!showSpace && segments.length === 0 && !endSlot) return null;

  const hasCompactSegments = segments.some(segment => segment.showOnCompactMobile);
  const firstCompactSegment = segments.find(segment => segment.showOnCompactMobile);

  const metadata = (
    <>
      {showSpace ? (
        <Link
          href={NavUtils.toSpace(item.spaceId)}
          className={cx(
            'flex min-w-0 items-center gap-1.5 text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-text hover:underline',
            compactOnMobile && 'md:text-footnoteMedium md:tracking-normal md:text-grey-04'
          )}
        >
          <SpaceThumb
            image={item.spaceImage}
            name={item.spaceName}
            className={compactOnMobile ? 'md:size-4 md:rounded-sm' : undefined}
          />
          <span className="min-w-0 truncate">{item.spaceName}</span>
        </Link>
      ) : null}
      {/* A 6px spacer rather than a dot: the space is the row's subject, not one of its facts. */}
      {showSpace && segments.length > 0 ? (
        <span className={cx('w-1.5 shrink-0', compactOnMobile && !hasCompactSegments && 'md:hidden')} />
      ) : null}
      {segments.map((segment, index) => {
        // A segment later in the desktop run may become the first compact segment. Its desktop
        // separator disappears with the segments ahead of it; subsequent compact segments keep
        // their dot, so the responsive row has exactly the same separator rules without a second
        // copy of any semantic content.
        const hideDotOnCompactMobile = !segment.showOnCompactMobile || segment.key === firstCompactSegment?.key;
        const renderedSegment = compactOnMobile ? (
          // Segments are intentionally arbitrary React nodes. In particular, the Join action is
          // rooted in a div through Pending, so this wrapper must permit both block and inline
          // content. A span here produces browser-repaired SSR markup and a hydration mismatch.
          <div className={cx('contents', !segment.showOnCompactMobile && 'md:hidden')}>{segment.content}</div>
        ) : (
          segment.content
        );

        return (
          <React.Fragment key={segment.key}>
            {index > 0 ? (
              <MetaDot className={compactOnMobile && hideDotOnCompactMobile ? 'md:hidden' : undefined} />
            ) : null}
            {renderedSegment}
          </React.Fragment>
        );
      })}
    </>
  );

  return (
    <div
      className={cx(
        'flex min-w-0 flex-wrap items-center gap-y-2',
        compactOnMobile && 'md:claim-card-panel-header!',
        className
      )}
    >
      {compactOnMobile ? (
        // Preserve the ordinary desktop row's direct-child layout. This group only becomes a flex
        // item where the max-width mobile variant also moves the end slot to the header's far edge.
        <div className="contents md:flex md:min-w-0 md:flex-1 md:flex-wrap md:items-center">{metadata}</div>
      ) : (
        metadata
      )}
      {endSlot}
    </div>
  );
}
