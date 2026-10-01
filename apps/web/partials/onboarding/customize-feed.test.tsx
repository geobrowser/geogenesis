import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedTopicPicker } from './customize-feed';

const mocks = vi.hoisted(() => ({
  suggestions: [] as { id: string; name: string }[],
  search: { results: [] as { id: string; name: string }[], isSearching: false, isError: false },
}));

vi.mock('~/core/topics/use-topic-suggestions', () => ({
  useTopicSuggestions: () => ({
    suggestions: mocks.suggestions,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasMore: false,
    isFetchingMore: false,
    fetchMore: vi.fn(),
  }),
  useTopicSearch: () => mocks.search,
}));

beforeEach(() => {
  mocks.suggestions = [];
  mocks.search = { results: [], isSearching: false, isError: false };
});
afterEach(cleanup);

describe('FeedTopicPicker', () => {
  it("won't pick a hit from the previous query while the next one loads", () => {
    mocks.search = { results: [{ id: 'btc', name: 'Bitcoin' }], isSearching: true, isError: false };
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
});
