'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import type { TopicConnectionCounts } from '~/core/topics/browse/use-topic-connection-counts';
import { NavUtils } from '~/core/utils/utils';

import { FallbackImage } from '~/design-system/fallback-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { EntityRowActions } from '~/partials/entity-page/entity-row-actions';

import { ExploreCardTitle } from './explore-card-title';
import { ExploreFeedCommentLink } from './explore-feed-comment-link';
import { ExploreMetaRow } from './explore-meta-row';
import { MetaDot } from './meta-dot';

/**
 * A Topic in an explore feed.
 *
 * The generic card, plus the one thing it cannot say. A topic has no verdict, no video and no
 * position to take — what distinguishes one from the next is how much hangs off it — and the
 * generic card renders it as a name and a description, which is the same card an empty topic gets.
 * So this is deliberately the generic card's layout down to the class: the same meta row, the same
 * 60px thumbnail well, the same title and two-line description, the same actions row. Everything
 * new is one line of counts between the description and the actions.
 *
 * Not wired into `ExploreFeedCard`'s type dispatch. The claim page's Topics tab is the surface that
 * asked for this and the surface that can pay for it: the counts are a second request, and the main
 * explore feed pre-mounts cards thousands of pixels below the fold. A Topic drawn anywhere else
 * keeps exactly the card it has today.
 */
export function TopicExploreFeedCard({
  item,
  counts,
  countsPending = false,
  hideSpaceLink = false,
  hideJoinButton = false,
  titleOpensSidePanel = false,
}: {
  item: ExploreFeedItem;
  /**
   * What is attached to this topic. `null` when the count could not be read, which draws no
   * metadata line at all rather than a row of zeros.
   */
  counts: TopicConnectionCounts | null;
  /** The counts are still in flight, so the line reserves its own height instead of appearing late. */
  countsPending?: boolean;
  hideSpaceLink?: boolean;
  hideJoinButton?: boolean;
  titleOpensSidePanel?: boolean;
}) {
  const entityHref = `${NavUtils.toEntity(item.spaceId, item.entityId)}#entity-comments`;

  return (
    <article className="flex flex-col gap-2 border-b border-divider py-4 last:border-b-0">
      <ExploreMetaRow item={item} hideSpaceLink={hideSpaceLink} hideJoinButton={hideJoinButton} />

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
            <ExploreCardTitle item={item} opensSidePanel={titleOpensSidePanel} />
            {item.description ? (
              <p className="mt-1 line-clamp-2 text-[16px]! leading-[20px]! font-normal! tracking-[-0.03em] text-grey-04">
                {item.description}
              </p>
            ) : null}
          </div>

          <TopicConnectionMeta counts={counts} pending={countsPending} />

          <EntityRowActions entityId={item.entityId} spaceId={item.spaceId} className="mt-1">
            <ExploreFeedCommentLink href={entityHref} count={item.commentCount} />
          </EntityRowActions>
        </div>
      </div>
    </article>
  );
}

const SEGMENT_CLASS = 'text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04';

/** "3 debates · 117 claims · 2 news stories", in the meta row's own type and separator. */
export function TopicConnectionMeta({
  counts,
  pending = false,
  className,
}: {
  counts: TopicConnectionCounts | null;
  pending?: boolean;
  className?: string;
}) {
  // A skeleton the width of a short line, so the card does not grow a row under the reader when
  // the counts land a beat after the topic itself.
  if (pending) return <Skeleton className="h-[13px] w-40" />;
  if (!counts) return null;

  // Debates first, then claims, then news stories: rarest and most specific to least. A topic with
  // debates on it is the interesting case and the count that most often distinguishes two topics,
  // and it would otherwise be the segment most likely to be pushed onto a second line.
  const segments = [
    { key: 'debates', count: counts.debates, noun: ['debate', 'debates'] as const },
    { key: 'claims', count: counts.claims, noun: ['claim', 'claims'] as const },
    { key: 'news', count: counts.news, noun: ['news story', 'news stories'] as const },
  ].filter(segment => segment.count > 0);

  // Zeros are dropped rather than printed: "0 news stories" on a topic that is entirely claims is
  // three words about something that isn't there. A topic with nothing attached says so once.
  if (segments.length === 0) {
    return <p className={cx(SEGMENT_CLASS, className)}>Nothing attached yet</p>;
  }

  return (
    <p className={cx('flex min-w-0 flex-wrap items-center', SEGMENT_CLASS, className)}>
      {segments.map((segment, index) => (
        <React.Fragment key={segment.key}>
          {index > 0 ? <MetaDot /> : null}
          <span className="shrink-0">
            <span className="tabular-nums">{segment.count.toLocaleString()}</span>{' '}
            {segment.count === 1 ? segment.noun[0] : segment.noun[1]}
          </span>
        </React.Fragment>
      ))}
    </p>
  );
}
