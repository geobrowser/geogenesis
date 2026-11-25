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
      <FollowerCount count={count} icon />
      <FollowTopicButton topic={topic} variant="compact" />
    </div>
  );
}

/**
 * "128 following": the one wording for a topic's follower count, wherever it is drawn. `icon` draws
 * a person icon and the number instead, for the compact topic header row; it still reads as
 * "128 following". Nothing at zero or while loading, so a surface never shows a zero or a count
 * that jumps in.
 */
export function FollowerCount({
  count,
  icon = false,
  className,
}: {
  count: number | null;
  icon?: boolean;
  className?: string;
}) {
  if (!count) return null;
  const number = count.toLocaleString('en-US');
  if (!icon) {
    return (
      <span className={cx('shrink-0 whitespace-nowrap', className)}>
        <span className="tabular-nums">{number}</span> following
      </span>
    );
  }
  const label = `${number} following`;
  return (
    <span
      title={label}
      className={cx('inline-flex shrink-0 items-center gap-1 text-metadata whitespace-nowrap text-grey-04', className)}
    >
      <Member />
      <span className="text-text tabular-nums" aria-hidden>
        {number}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
