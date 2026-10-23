'use client';

import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { ActionContextProvider } from '~/core/action-context-provider';
import type { ExploreCardTopic } from '~/core/explore/explore-card-item';
import { FollowButton } from '~/core/follows/follow-button';

import { META_SEGMENT_CLASS } from './explore-meta-row';

const SCOPE = { component: 'explore_card_topic_follow' } as const;

export function ExploreCardTopicFollow({
  topics,
  className,
}: {
  topics: readonly ExploreCardTopic[] | undefined;
  className?: string;
}) {
  if (!topics?.length) return null;
  const [first, ...rest] = topics;

  return (
    <ActionContextProvider value={SCOPE}>
      <div className={cx('flex min-w-0 items-center gap-1.5', className)}>
        <span className={cx(META_SEGMENT_CLASS, 'min-w-0 truncate')}>{first!.name}</span>
        <FollowButton target={{ kind: 'topic', id: first!.id, name: first!.name }} />
        {rest.length > 0 ? <MoreTopics topics={rest} /> : null}
      </div>
    </ActionContextProvider>
  );
}

function MoreTopics({ topics }: { topics: readonly ExploreCardTopic[] }) {
  const [open, setOpen] = React.useState(false);
  const list = <TopicList topics={topics} />;

  return (
    <Root open={open} onOpenChange={setOpen}>
      <Trigger
        type="button"
        aria-label={`Show ${topics.length} more ${topics.length === 1 ? 'topic' : 'topics'}`}
        onClick={event => event.stopPropagation()}
        className={cx(
          META_SEGMENT_CLASS,
          'shrink-0 rounded transition-colors duration-150 hover:text-text focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-03'
        )}
      >
        +{topics.length}
      </Trigger>
      <Portal>
        <Content
          side="bottom"
          align="end"
          sideOffset={8}
          avoidCollisions
          onClick={event => event.stopPropagation()}
          className="z-100 w-[260px] origin-top-right rounded-lg border border-grey-02 bg-white p-1 shadow-lg"
        >
          {list}
        </Content>
      </Portal>
      {open ? null : <div hidden>{list}</div>}
    </Root>
  );
}

function TopicList({ topics }: { topics: readonly ExploreCardTopic[] }) {
  return (
    <ul aria-label="More topics">
      {topics.map(topic => (
        <li key={topic.id} className="flex items-center justify-between gap-3 rounded px-2 py-1.5">
          <span className="min-w-0 truncate text-metadataMedium text-text">{topic.name}</span>
          <FollowButton target={{ kind: 'topic', id: topic.id, name: topic.name }} />
        </li>
      ))}
    </ul>
  );
}
