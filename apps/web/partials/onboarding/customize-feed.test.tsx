import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedTopicPicker } from './customize-feed';

const mocks = vi.hoisted(() => ({
  suggestions: [] as { id: string; name: string }[],
  hasMore: false,
  isFetchingMore: false,
  fetchMore: vi.fn(),
  search: {
    results: [] as { id: string; name: string }[],
    isSearching: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock('~/core/topics/use-topic-suggestions', () => ({
  useTopicSuggestions: () => ({
    suggestions: mocks.suggestions,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasMore: mocks.hasMore,
    isFetchingMore: mocks.isFetchingMore,
    fetchMore: mocks.fetchMore,
  }),
  useTopicSearch: () => mocks.search,
}));

beforeEach(() => {
  mocks.suggestions = [];
  mocks.hasMore = false;
  mocks.isFetchingMore = false;
  mocks.fetchMore.mockClear();
  mocks.search = { results: [], isSearching: false, isError: false, refetch: vi.fn() };
});
afterEach(cleanup);

describe('FeedTopicPicker', () => {
  it('loads more suggestions from a control outside the scrolling topics', () => {
    mocks.suggestions = [{ id: 'btc', name: 'Bitcoin' }];
    mocks.hasMore = true;
    render(<FeedTopicPicker spaceIds={[]} selected={[]} onToggle={vi.fn()} />);

    const more = screen.getByRole('button', { name: 'Show more topics' });
    expect(screen.getByRole('region', { name: 'Topics' })).not.toContainElement(more);
    fireEvent.click(more);

    expect(mocks.fetchMore).toHaveBeenCalledOnce();
  });

  it('disables the pagination control while the next suggestions load', () => {
    mocks.suggestions = [{ id: 'btc', name: 'Bitcoin' }];
    mocks.hasMore = true;
    mocks.isFetchingMore = true;
    render(<FeedTopicPicker spaceIds={[]} selected={[]} onToggle={vi.fn()} />);

    const more = screen.getByRole('button', { name: 'Loading more topics' });
    expect(more).toBeDisabled();
    fireEvent.click(more);
    expect(mocks.fetchMore).not.toHaveBeenCalled();
  });

  it('hides suggestion pagination during a topic search', () => {
    mocks.suggestions = [{ id: 'btc', name: 'Bitcoin' }];
    mocks.hasMore = true;
    render(<FeedTopicPicker spaceIds={[]} selected={[]} onToggle={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search topics'), { target: { value: 'crypto' } });

    expect(screen.queryByRole('button', { name: 'Show more topics' })).not.toBeInTheDocument();
  });

  it("won't pick a hit from the previous query while the next one loads", () => {
    mocks.search = { results: [{ id: 'btc', name: 'Bitcoin' }], isSearching: true, isError: false, refetch: vi.fn() };
    const onToggle = vi.fn();
    render(<FeedTopicPicker spaceIds={[]} selected={[]} onToggle={onToggle} />);
    fireEvent.change(screen.getByLabelText('Search topics'), { target: { value: 'Mental health' } });

    const stale = screen.getByRole('button', { name: 'Bitcoin' });
    fireEvent.click(stale);

    expect(stale).toHaveAttribute('aria-disabled', 'true');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('offers a retry when the spaces to suggest from failed to load', () => {
    const onRetryPrepare = vi.fn();
    render(
      <FeedTopicPicker spaceIds={[]} selected={[]} onToggle={vi.fn()} failedToPrepare onRetryPrepare={onRetryPrepare} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText(/couldn.t load topics/)).toBeInTheDocument();
    expect(onRetryPrepare).toHaveBeenCalledOnce();
  });

  it('retries a failed search', () => {
    mocks.search = { results: [], isSearching: false, isError: true, refetch: vi.fn() };
    render(<FeedTopicPicker spaceIds={[]} selected={[]} onToggle={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search topics'), { target: { value: 'crypto' } });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mocks.search.refetch).toHaveBeenCalledOnce();
  });
});
