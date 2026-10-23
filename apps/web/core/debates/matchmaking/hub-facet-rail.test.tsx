import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { HubFacetRail, TOPIC_ROWS_PER_PAGE } from './hub-facet-rail';

const mocks = vi.hoisted(() => ({ showMore: null as null | (() => unknown), hasMore: false }));

vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map(), isLoading: false }),
  spaceLabel: () => null,
}));

// jsdom has no layout to scroll; what matters here is what the rail asks the sentinel for.
vi.mock('~/core/hooks/use-infinite-scroll-sentinel', () => ({
  useInfiniteScrollSentinel: ({
    hasNextPage,
    fetchNextPage,
  }: {
    hasNextPage: boolean;
    fetchNextPage: () => unknown;
  }) => {
    mocks.hasMore = hasNextPage;
    mocks.showMore = fetchNextPage;
    return () => {};
  },
}));

afterEach(cleanup);

const TOPIC_COUNT = 75;
const topics = Array.from({ length: TOPIC_COUNT }, (_, index) => ({
  id: `topic-${index}`,
  name: `Topic ${index}`,
  count: TOPIC_COUNT - index,
}));

function renderRail() {
  render(
    <HubFacetRail
      facetSpaces={[]}
      spaceIds={[]}
      onSpaceToggle={() => {}}
      onSpacesClear={() => {}}
      facetTopics={topics}
      topicIds={[]}
      onTopicToggle={() => {}}
      onTopicsClear={() => {}}
    />
  );
}

const topicRows = () => screen.getAllByRole('checkbox', { name: /^Topic \d+/ });

describe('HubFacetRail topics', () => {
  // A broad scope carries well over a thousand topics, and drawing them all at once was the cost.
  it('draws one page of topics to begin with', () => {
    renderRail();

    expect(topicRows()).toHaveLength(TOPIC_ROWS_PER_PAGE);
    expect(screen.getByTestId('topic-rows-sentinel')).toBeInTheDocument();
    expect(mocks.hasMore).toBe(true);
  });

  it('draws the next page as the rail scrolls to the end, until there are none left', () => {
    renderRail();

    act(() => void mocks.showMore?.());
    expect(topicRows()).toHaveLength(TOPIC_ROWS_PER_PAGE * 2);

    act(() => void mocks.showMore?.());
    expect(topicRows()).toHaveLength(TOPIC_COUNT);
    expect(screen.queryByTestId('topic-rows-sentinel')).not.toBeInTheDocument();
    expect(mocks.hasMore).toBe(false);
  });

  // Paging is only what is drawn: a topic past the first page is still a search away.
  it('searches every topic, not just the rows drawn', () => {
    renderRail();

    fireEvent.change(screen.getByRole('textbox', { name: 'Find a topic' }), { target: { value: 'Topic 74' } });

    expect(topicRows()).toHaveLength(1);
    expect(screen.getByText('Topic 74')).toBeInTheDocument();
  });
});
