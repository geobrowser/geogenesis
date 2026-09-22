import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import type { TopicConnectionCounts } from '~/core/topics/browse/use-topic-connection-counts';
import type { Relation } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { ClaimTopicsTab } from './claim-topics-tab';

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  rowsLoading: false,
  rowsError: false,
  refetch: vi.fn(),
  /** Ids the hydration was asked for, so the tab's dedupe and its order are both observable. */
  rowIdCalls: [] as string[][],
  counts: null as Record<string, TopicConnectionCounts> | null,
  countsLoading: false,
  countsError: false,
  countIdCalls: [] as string[][],
}));

vi.mock('./use-claim-explore-rows', () => ({
  useClaimExploreRows: (ids: string[]) => {
    mocks.rowIdCalls.push(ids);
    return {
      data: mocks.rows,
      isLoading: mocks.rowsLoading,
      isError: mocks.rowsError,
      isFetching: false,
      refetch: mocks.refetch,
    };
  },
}));

vi.mock('~/core/topics/browse/use-topic-connection-counts', () => ({
  useTopicConnectionCounts: (ids: string[]) => {
    mocks.countIdCalls.push(ids);
    return { countsByTopicId: mocks.counts, isLoading: mocks.countsLoading, isError: mocks.countsError };
  },
}));

vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: {}, isLoading: false }),
  spaceLabel: () => ({ name: 'Space One', image: null }),
}));

// The card has its own suite. Here it only has to say which topic it drew and with what counts.
vi.mock('~/partials/explore/topic-explore-feed-card', () => ({
  TopicExploreFeedCard: (props: { item: { entityId: string; title: string }; counts: unknown }) => (
    <div data-testid="topic-card" data-entity={props.item.entityId} data-counts={JSON.stringify(props.counts)}>
      {props.item.title}
    </div>
  ),
}));

const row = (id: string, title: string): ExploreFeedRow => ({
  entityId: id,
  spaceId: 'space-1',
  types: [],
  createdAtSec: 0,
  title,
  description: null,
  imageUrl: null,
  recordingUrls: [],
  debateVideoUrls: [],
  debateClaim: null,
  commentCount: 0,
  isMemberOrEditor: false,
});

const counts = (claims: number, news: number, debates: number): TopicConnectionCounts => ({
  claims,
  news,
  debates,
  total: claims + news + debates,
});

const topicRelation = (id: string) => ({ id: `relation-${id}`, toEntity: { id, name: id } }) as unknown as Relation;

const drawnTopics = () => screen.getAllByTestId('topic-card').map(card => card.getAttribute('data-entity'));

beforeEach(() => {
  mocks.rows = [];
  mocks.rowsLoading = false;
  mocks.rowsError = false;
  mocks.rowIdCalls = [];
  mocks.counts = null;
  mocks.countsLoading = false;
  mocks.countsError = false;
  mocks.countIdCalls = [];
});

afterEach(cleanup);

describe('ClaimTopicsTab', () => {
  const topics = [topicRelation('topic-a'), topicRelation('topic-b'), topicRelation('topic-c')];

  it('orders by everything the metadata line adds up, largest first', () => {
    mocks.rows = [row('topic-a', 'A'), row('topic-b', 'B'), row('topic-c', 'C')];
    mocks.counts = {
      [normId('topic-a')]: counts(1, 0, 0),
      [normId('topic-b')]: counts(100, 5, 2),
      [normId('topic-c')]: counts(10, 0, 1),
    };

    render(<ClaimTopicsTab topics={topics} spaceId="space-1" />);

    expect(drawnTopics()).toEqual(['topic-b', 'topic-c', 'topic-a']);
  });

  it('breaks a tie on claims, then on name, so the order is stable', () => {
    mocks.rows = [row('topic-a', 'Zebra'), row('topic-b', 'Apple'), row('topic-c', 'Middle')];
    mocks.counts = {
      // Same total; different shapes.
      [normId('topic-a')]: counts(5, 5, 0),
      [normId('topic-b')]: counts(5, 5, 0),
      [normId('topic-c')]: counts(9, 1, 0),
    };

    render(<ClaimTopicsTab topics={topics} spaceId="space-1" />);

    expect(drawnTopics()).toEqual(['topic-c', 'topic-b', 'topic-a']);
  });

  it('hands each card its own counts', () => {
    mocks.rows = [row('topic-a', 'A')];
    mocks.counts = { [normId('topic-a')]: counts(7, 1, 2) };

    render(<ClaimTopicsTab topics={[topicRelation('topic-a')]} spaceId="space-1" />);

    expect(screen.getByTestId('topic-card')).toHaveAttribute(
      'data-counts',
      JSON.stringify({ claims: 7, news: 1, debates: 2, total: 10 })
    );
  });

  it('keeps the claim’s order when only some count batches answered', () => {
    // The counts arrive in batches, so one can fail while another succeeds. Sorting the partial
    // map ranks every unmeasured topic as zero and then alphabetises it — neither the claim's
    // order nor largest-first — and nothing on screen says which topics were measured.
    mocks.rows = [row('topic-a', 'A'), row('topic-b', 'B'), row('topic-c', 'C')];
    mocks.countsError = true;
    mocks.counts = { [normId('topic-c')]: counts(1, 0, 0) };

    render(<ClaimTopicsTab topics={topics} spaceId="space-1" />);

    expect(drawnTopics()).toEqual(['topic-a', 'topic-b', 'topic-c']);
  });

  it('still gives the cards whose batch answered their counts', () => {
    mocks.rows = [row('topic-a', 'A'), row('topic-b', 'B')];
    mocks.countsError = true;
    mocks.counts = { [normId('topic-b')]: counts(4, 1, 2) };

    render(<ClaimTopicsTab topics={topics} spaceId="space-1" />);

    const [first, second] = screen.getAllByTestId('topic-card');
    expect(first).toHaveAttribute('data-counts', 'null');
    expect(second).toHaveAttribute('data-counts', JSON.stringify({ claims: 4, news: 1, debates: 2, total: 7 }));
  });

  it('keeps the claim’s own order, and no counts, when the count could not be read', () => {
    mocks.rows = [row('topic-a', 'A'), row('topic-b', 'B'), row('topic-c', 'C')];
    mocks.countsError = true;
    mocks.counts = null;

    render(<ClaimTopicsTab topics={topics} spaceId="space-1" />);

    expect(drawnTopics()).toEqual(['topic-a', 'topic-b', 'topic-c']);
    expect(screen.getAllByTestId('topic-card')[0]).toHaveAttribute('data-counts', 'null');
  });

  it('draws nothing until the counts are in, so the list cannot resequence under the reader', () => {
    mocks.rows = [row('topic-a', 'A')];
    mocks.countsLoading = true;

    render(<ClaimTopicsTab topics={topics} spaceId="space-1" />);

    expect(screen.queryByTestId('topic-card')).toBeNull();
    expect(screen.getByText('Loading topics…')).toBeInTheDocument();
  });

  it('asks for a topic related twice only once', () => {
    render(
      <ClaimTopicsTab
        topics={[topicRelation('topic-a'), topicRelation('TOPIC-A'), topicRelation('topic-b')]}
        spaceId="space-1"
      />
    );

    expect(mocks.rowIdCalls.at(-1)).toEqual(['topic-a', 'topic-b']);
    expect(mocks.countIdCalls.at(-1)).toEqual(['topic-a', 'topic-b']);
  });

  it('is honest about a claim with no topics, which is a route somebody bookmarked', () => {
    render(<ClaimTopicsTab topics={[]} spaceId="space-1" />);

    expect(screen.getByText('No topics have been linked to this claim yet.')).toBeInTheDocument();
  });

  it('offers a retry when the topics themselves could not be loaded', () => {
    mocks.rowsError = true;

    render(<ClaimTopicsTab topics={topics} spaceId="space-1" />);

    expect(screen.getByText('Couldn’t load topics.')).toBeInTheDocument();
  });
});
