'use client';

import * as React from 'react';

import cx from 'classnames';

import { ActionSurfaceArticle } from '~/core/action-context-provider';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import type { TopicConnectionCounts } from '~/core/topics/browse/use-topic-connection-counts';
import { FollowTopicButton } from '~/core/topics/follow-topic-button';
import { useTopicFollowerCount } from '~/core/topics/use-topic-follower-count';
import { NavUtils } from '~/core/utils/utils';

import { ENTITY_COMMENTS_ANCHOR_ID } from '~/partials/comments/entity-comments-anchor';

import { EXPLORE_CARD_CLASS, ExploreCardDefaultBody, ExploreCardSurface } from './explore-card-chrome';
import { ExploreFeedCommentLink } from './explore-feed-comment-link';
import { ExploreMetaRow, META_SEGMENT_CLASS } from './explore-meta-row';
import { MetaDot } from './meta-dot';

type TopicCardProps = {
  item: ExploreFeedItem;
  /**
   * What is attached to this topic. `null` when the count could not be read, or was never asked
   * for, which leaves the line to the follower count alone rather than a row of zeros.
   */
  counts: TopicConnectionCounts | null;
  hideSpaceLink?: boolean;
  hideJoinButton?: boolean;
  titleOpensSidePanel?: boolean;
};

/**
 * A Topic in an explore feed.
 *
 * The generic card, plus the things it cannot say. A topic has no verdict, no video and no
 * position to take — what distinguishes one from the next is who follows it and how much hangs off
 * it — and the generic card renders it as a name and a description, which is the same card an
 * empty topic gets.
 *
 * So this *is* the generic card: the shared frame, meta row and body from `explore-card-chrome`,
 * with the counts passed into the body's `meta` slot. Reproducing the body here instead would have
 * been the third copy of that layout in this directory, and the first two drifted.
 *
 * The action row is its own (GEO-3191): Follow in place of the votes, then the comment count.
 * Following is a topic's one action; an upvote said nothing about wanting to see more of it.
 *
 * The connection counts are a second request, which the claim page's Topics tab pays for. The main
 * explore feed pre-mounts cards thousands of pixels below the fold, so its dispatch passes `null`
 * and the line carries the follower count alone, which is batched across every card on the page.
 */
export function TopicExploreFeedCard(props: TopicCardProps) {
  return (
    <ExploreCardSurface item={props.item}>
      <TopicExploreFeedCardArticle {...props} />
    </ExploreCardSurface>
  );
}

/** The card without its attribution surface, for `ExploreFeedCard`, which draws its own. */
export function TopicExploreFeedCardArticle({
  item,
  counts,
  hideSpaceLink = false,
  hideJoinButton = false,
  titleOpensSidePanel = false,
}: TopicCardProps) {
  const followerCount = useTopicFollowerCount(item.entityId);

  return (
    <ActionSurfaceArticle className={EXPLORE_CARD_CLASS}>
      <ExploreMetaRow item={item} hideSpaceLink={hideSpaceLink} hideJoinButton={hideJoinButton} />
      <ExploreCardDefaultBody
        item={item}
        titleOpensSidePanel={titleOpensSidePanel}
        meta={<TopicConnectionMeta counts={counts} followerCount={followerCount} />}
        actions={<TopicCardActions item={item} />}
      />
    </ActionSurfaceArticle>
  );
}

/** Follow, then the comment count: the vote row every other card ends on, without the votes. */
function TopicCardActions({ item }: { item: ExploreFeedItem }) {
  return (
    <div className="mt-1 flex items-center gap-4">
      <FollowTopicButton topic={{ id: item.entityId, name: item.title }} />
      <ExploreFeedCommentLink
        href={`${NavUtils.toEntity(item.spaceId, item.entityId)}#${ENTITY_COMMENTS_ANCHOR_ID}`}
        count={item.commentCount}
      />
    </div>
  );
}

/**
 * "128 following · 3 debates · 117 claims · 2 news stories", in the meta row's own type and
 * separator. Followers lead: it is the one count every topic card has, and the one the button
 * below it changes.
 */
export function TopicConnectionMeta({
  counts,
  followerCount = null,
  className,
}: {
  counts: TopicConnectionCounts | null;
  /** `null` while loading; hidden at zero like every other segment. */
  followerCount?: number | null;
  className?: string;
}) {
  const followers = followerCount ? (
    <span className="shrink-0">
      <span className="tabular-nums">{followerCount.toLocaleString('en-US')}</span> following
    </span>
  ) : null;

  if (!counts) {
    return followers ? (
      <p className={cx('flex min-w-0 items-center', META_SEGMENT_CLASS, className)}>{followers}</p>
    ) : null;
  }

  // Debates first, then claims, then news stories: rarest and most specific to least. A topic with
  // debates on it is the interesting case and the count that most often distinguishes two topics,
  // and it would otherwise be the segment most likely to be pushed onto a second line.
  const segments = [
    { key: 'debates', count: counts.debates, noun: ['debate', 'debates'] as const },
    { key: 'claims', count: counts.claims, noun: ['claim', 'claims'] as const },
    { key: 'news', count: counts.news, noun: ['news story', 'news stories'] as const },
  ].filter(segment => segment.count > 0);

  // Zeros are dropped rather than printed: "0 news stories" on a topic that is entirely claims is
  // three words about something that isn't there. A topic with none of the three says so once.
  //
  // Named rather than summarised: a topic also carries episodes, tweets, posts and the rest — the
  // topic page's composition strip counts six kinds and a remainder — so "nothing attached" would
  // be a claim about buckets this card never measured. On a claim's Topics tab the line is close
  // to unreachable anyway, since the claim being read is itself a claim attached to every topic
  // listed; it can show while that relation is still indexing, and wherever else the card is used.
  if (segments.length === 0) {
    return (
      <p className={cx('flex min-w-0 flex-wrap items-center', META_SEGMENT_CLASS, className)}>
        {followers}
        {followers ? <MetaDot /> : null}
        <span>No debates, claims or news stories yet</span>
      </p>
    );
  }

  return (
    <p className={cx('flex min-w-0 flex-wrap items-center', META_SEGMENT_CLASS, className)}>
      {followers}
      {segments.map((segment, index) => (
        <React.Fragment key={segment.key}>
          {index > 0 || followers ? <MetaDot /> : null}
          <span className="shrink-0">
            <span className="tabular-nums">{segment.count.toLocaleString()}</span>{' '}
            {segment.count === 1 ? segment.noun[0] : segment.noun[1]}
          </span>
        </React.Fragment>
      ))}
    </p>
  );
}
