'use client';

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
      {count ? (
        <span className="text-metadata whitespace-nowrap text-grey-04">
          <span className="text-text tabular-nums">{count.toLocaleString('en-US')}</span> following
        </span>
      ) : null}
      <FollowTopicButton topic={topic} variant="page" />
    </div>
  );
}
