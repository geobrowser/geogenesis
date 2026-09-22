'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import type { TopicConnectionCounts } from '~/core/topics/browse/use-topic-connection-counts';

import { EXPLORE_CARD_CLASS, ExploreCardActions, ExploreCardDefaultBody } from './explore-card-chrome';
import { ExploreMetaRow, META_SEGMENT_CLASS } from './explore-meta-row';
import { MetaDot } from './meta-dot';

/**
 * A Topic in an explore feed.
 *
 * The generic card, plus the one thing it cannot say. A topic has no verdict, no video and no
 * position to take — what distinguishes one from the next is how much hangs off it — and the
 * generic card renders it as a name and a description, which is the same card an empty topic gets.
 *
 * So this *is* the generic card: the shared frame, meta row, body and actions from
 * `explore-card-chrome`, with the counts passed into the body's `meta` slot. Reproducing the body
 * here instead would have been the third copy of that layout in this directory, and the first two
 * drifted.
 *
 * Not wired into `ExploreFeedCard`'s type dispatch. The claim page's Topics tab is the surface that
 * asked for this and the surface that can pay for it: the counts are a second request, and the main
 * explore feed pre-mounts cards thousands of pixels below the fold. A Topic drawn anywhere else
 * keeps exactly the card it has today.
 */
export function TopicExploreFeedCard({
  item,
  counts,
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
  hideSpaceLink?: boolean;
  hideJoinButton?: boolean;
  titleOpensSidePanel?: boolean;
}) {
  return (
    <article className={EXPLORE_CARD_CLASS}>
      <ExploreMetaRow item={item} hideSpaceLink={hideSpaceLink} hideJoinButton={hideJoinButton} />
      <ExploreCardDefaultBody
        item={item}
        titleOpensSidePanel={titleOpensSidePanel}
        meta={<TopicConnectionMeta counts={counts} />}
        actions={<ExploreCardActions item={item} />}
      />
    </article>
  );
}

/** "3 debates · 117 claims · 2 news stories", in the meta row's own type and separator. */
export function TopicConnectionMeta({
  counts,
  className,
}: {
  counts: TopicConnectionCounts | null;
  className?: string;
}) {
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
    return <p className={cx(META_SEGMENT_CLASS, className)}>Nothing attached yet</p>;
  }

  return (
    <p className={cx('flex min-w-0 flex-wrap items-center', META_SEGMENT_CLASS, className)}>
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
