'use client';

import cx from 'classnames';

import { FollowTopicButton } from './follow-button';
import { useTopicFollowerCount } from './use-follower-count';

/**
 * The topic page header's action: how many follow the topic, then the button. The count reads
 * before the button so the row ends on the thing to press. Hidden at zero.
 */
export function TopicFollowControl({ topic }: { topic: { id: string; name?: string | null } }) {
  const count = useTopicFollowerCount(topic.id);

  return (
    <div className="flex shrink-0 items-center gap-3">
      <FollowerCount count={count} className="text-metadata text-grey-04" numberClassName="text-text" />
      <FollowTopicButton topic={topic} variant="page" />
    </div>
  );
}

/**
 * "128 following" for a topic, "42 followers" for a person: the one wording for a follower count,
 * wherever it is drawn. A person's says "followers" so it isn't read as who they follow. Nothing at
 * zero or while loading, so a surface never shows a zero or a count that jumps in.
 */
export function FollowerCount({
  count,
  kind = 'topic',
  className,
  numberClassName,
}: {
  count: number | null;
  kind?: 'topic' | 'person';
  className?: string;
  numberClassName?: string;
}) {
  if (!count) return null;
  const noun = kind === 'person' ? (count === 1 ? 'follower' : 'followers') : 'following';
  return (
    <span className={cx('shrink-0 whitespace-nowrap', className)}>
      <span className={cx('tabular-nums', numberClassName)}>{count.toLocaleString('en-US')}</span> {noun}
    </span>
  );
}
