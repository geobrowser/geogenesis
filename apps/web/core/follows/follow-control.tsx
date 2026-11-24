'use client';

import cx from 'classnames';

import { Member } from '~/design-system/icons/member';

import { FollowTopicButton } from './follow-button';
import { useTopicFollowerCount } from './use-follower-count';

/**
 * The topic page header's action: how many follow the topic, then the button. The count reads
 * before the button so the row ends on the thing to press. Hidden at zero. Both are the compact
 * size, because they share the type-chip row under the title with history and the menu, and that
 * row stays one line on a 320px phone.
 */
export function TopicFollowControl({ topic }: { topic: { id: string; name?: string | null } }) {
  const count = useTopicFollowerCount(topic.id);

  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <FollowerCount count={count} />
      <FollowTopicButton topic={topic} variant="compact" />
    </div>
  );
}

/**
 * A topic's follower count: a person icon and the number, read as "128 following". Nothing at zero
 * or while loading, so a surface never shows a zero or a count that jumps in.
 */
export function FollowerCount({ count, className }: { count: number | null; className?: string }) {
  if (!count) return null;
  const label = `${count.toLocaleString('en-US')} following`;
  return (
    <span
      title={label}
      className={cx('inline-flex shrink-0 items-center gap-1 text-metadata whitespace-nowrap text-grey-04', className)}
    >
      <Member />
      <span className="text-text tabular-nums" aria-hidden>
        {count.toLocaleString('en-US')}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
