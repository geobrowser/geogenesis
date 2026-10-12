'use client';

import cx from 'classnames';

import { FollowTopicButton } from './follow-topic-button';
import { useTopicFollowerCount } from './use-topic-follower-count';

/**
 * The topic page header's action: how many follow the topic, then the button. The count reads
 * before the button so the row ends on the thing to press. Hidden at zero.
 */
export function TopicFollowControl({ topic }: { topic: { id: string; name?: string | null } }) {
  const count = useTopicFollowerCount(topic.id);

  return (
    <div className="flex shrink-0 items-center gap-3">
      <TopicFollowerCount count={count} className="text-metadata text-grey-04" numberClassName="text-text" />
      <FollowTopicButton topic={topic} variant="page" />
    </div>
  );
}

/**
 * "128 following": the one wording for a topic's follower count, wherever it is drawn. Nothing at
 * zero or while loading, so a surface never shows "0 following" or a count that jumps in.
 */
export function TopicFollowerCount({
  count,
  className,
  numberClassName,
}: {
  count: number | null;
  className?: string;
  numberClassName?: string;
}) {
  if (!count) return null;
  return (
    <span className={cx('shrink-0 whitespace-nowrap', className)}>
      <span className={cx('tabular-nums', numberClassName)}>{count.toLocaleString('en-US')}</span> following
    </span>
  );
}
