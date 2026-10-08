import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ActionContextProvider, useActionContext } from '~/core/action-context-provider';
import { recordAction } from '~/core/analytics-operations';
import { TOPIC_TYPE_ID } from '~/core/constants';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import type { Relation } from '~/core/types';

import { ClaimTopicsTab } from './claim-topics-tab';

const { capture, rows } = vi.hoisted(() => ({ capture: vi.fn(), rows: [] as ExploreFeedRow[] }));
vi.mock('~/core/analytics', () => ({ capture, analyticsContextRevision: () => 0 }));
vi.mock('./use-claim-explore-rows', () => ({ useClaimExploreRows: () => ({ data: rows, refetch: vi.fn() }) }));
vi.mock('~/core/topics/browse/use-topic-connection-counts', () => ({
  useTopicConnectionCounts: () => ({
    countsByTopicId: {
      a: { total: 1, claims: 1, debates: 0, news: 0 },
      b: { total: 5, claims: 5, debates: 0, news: 0 },
    },
  }),
}));
vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: {} }),
  spaceLabel: () => ({ name: 'Space', image: null }),
}));
vi.mock('~/core/profile/use-infinite-sentinel', () => ({ useInfiniteSentinel: () => ({ current: null }) }));
// The actual custom card, feed, sorting and attribution components stay in this test.
vi.mock('~/partials/explore/explore-feed-card', () => ({ ExploreFeedCard: () => null }));
vi.mock('~/partials/explore/explore-meta-row', () => ({ META_SEGMENT_CLASS: '', ExploreMetaRow: () => null }));
vi.mock('~/partials/explore/explore-card-title', () => ({
  ExploreCardTitle: ({ item }: { item: { title: string } }) => <h2>{item.title}</h2>,
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
// A topic card's one action is Follow (GEO-3191); this stands in for it to read the attribution.
vi.mock('~/core/topics/follow-topic-button', () => ({
  FollowTopicButton: ({ topic }: { topic: { id: string } }) => {
    const getContext = useActionContext('topic_follow_button', 'topic', topic.id);
    return <button onClick={() => recordAction('follow_topic', getContext())}>Follow {topic.id}</button>;
  },
}));
vi.mock('~/core/topics/use-topic-follower-count', () => ({ useTopicFollowerCount: () => null }));
const observers = new Map<Element, IntersectionObserverCallback>();
beforeEach(() => {
  window.history.replaceState({}, '', '/space/space/claim');
  rows.splice(
    0,
    rows.length,
    ...['a', 'b'].map(entityId => ({
      entityId,
      title: entityId,
      spaceId: 'space',
      types: [{ id: TOPIC_TYPE_ID, name: 'Topic' }],
      createdAtSec: 0,
      description: null,
      imageUrl: null,
      recordingUrls: [],
      debateVideoUrls: [],
      debateClaim: null,
      commentCount: 0,
      isMemberOrEditor: false,
    }))
  );
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe = (element: Element) => observers.set(element, this.callback);
      disconnect() {}
    }
  );
});
afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observers.clear();
  capture.mockReset();
});
function mount() {
  const topics = ['a', 'b'].map(id => ({ id, toEntity: { id } })) as Relation[];
  return render(
    <ActionContextProvider
      value={{
        list_id: 'claim_topics',
        item_position: 99,
        target_id: 'claim',
        target_type: 'claim',
        target_type_ids: ['claim-type'],
        origin_entity_ids: ['parent-source'],
      }}
    >
      <ClaimTopicsTab topics={topics} spaceId="space" />
    </ActionContextProvider>
  );
}

it('attributes custom topic actions to their sorted row and own entity metadata', () => {
  mount();
  expect(screen.getAllByRole('heading').map(node => node.textContent)).toEqual(['b', 'a']);
  for (const [index, id] of ['b', 'a'].entries()) {
    fireEvent.click(screen.getByRole('button', { name: `Follow ${id}` }));
    const action = capture.mock.calls.at(-1)!;
    expect(action[0]).toBe('action_completed');
    expect(action[1]).toMatchObject({
      component: 'explore_feed_card',
      target_type: 'topic',
      target_id: id,
      target_type_ids: [TOPIC_TYPE_ID],
      list_id: 'claim_topics',
      item_position: index + 1,
    });
    expect(action[1]).not.toHaveProperty('origin_entity_ids');
  }
});

it('measures the existing topic articles once and joins visible cards to actions', () => {
  const { container } = mount();
  const articles = [...container.querySelectorAll('article')];
  expect(articles).toHaveLength(2);
  expect(articles[0].parentElement).toBe(articles[1].parentElement);
  expect(articles[0].parentElement?.children).toHaveLength(2);
  expect(articles[1].matches(':last-child')).toBe(true);
  expect(capture).not.toHaveBeenCalled();
  expect([...observers.keys()]).toEqual(articles);
  const show = (article: Element) =>
    act(() =>
      observers.get(article)!(
        [{ target: article, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
  show(articles[0]);
  show(articles[0]);
  const impressions = capture.mock.calls.filter(([event]) => event === 'component_impression');
  expect(impressions).toHaveLength(1);
  expect(impressions[0][1]).toMatchObject({
    target_id: 'b',
    target_type: 'topic',
    item_position: 1,
    list_id: 'claim_topics',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Follow b' }));
  expect(capture.mock.calls.at(-1)![1].presentation_instance_id).toBe(impressions[0][1].presentation_instance_id);
});
