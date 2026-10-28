import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TopicOption } from '~/core/topics/use-topic-suggestions';

import { FeedTopicPicker } from './customize-feed';

const mocks = vi.hoisted(() => ({
  suggestions: [] as TopicOption[],
  hasMore: false,
  isFetchingMore: false,
  fetchMore: vi.fn(),
  search: {
    results: [] as TopicOption[],
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

function Picker({
  initialSelected = [],
  onChange = vi.fn(),
  ...props
}: {
  initialSelected?: TopicOption[];
  onChange?: (topics: TopicOption[]) => void;
  failedToPrepare?: boolean;
  onRetryPrepare?: () => void;
}) {
  const [selected, setSelected] = React.useState(initialSelected);
  return (
    <FeedTopicPicker
      spaceIds={[]}
      selected={selected}
      onChange={topics => {
        onChange(topics);
        setSelected(topics);
      }}
      {...props}
    />
  );
}

function search(query: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Search topics' }), { target: { value: query } });
}

beforeEach(() => {
  mocks.suggestions = [];
  mocks.hasMore = false;
  mocks.isFetchingMore = false;
  mocks.fetchMore.mockClear();
  mocks.search = { results: [], isSearching: false, isError: false, refetch: vi.fn() };
});
afterEach(cleanup);

describe('FeedTopicPicker', () => {
  it('loads more topics from the end of the scrolling suggestions', () => {
    mocks.suggestions = [{ id: 'btc', name: 'Bitcoin' }];
    mocks.hasMore = true;
    render(<Picker />);

    const more = screen.getByRole('button', { name: 'Show more topics' });
    expect(screen.getByRole('region', { name: 'Topics' })).toContainElement(more);
    fireEvent.click(more);

    expect(mocks.fetchMore).toHaveBeenCalledOnce();
  });

  it('disables pagination while the next suggestions load', () => {
    mocks.suggestions = [{ id: 'btc', name: 'Bitcoin' }];
    mocks.hasMore = true;
    mocks.isFetchingMore = true;
    render(<Picker />);

    const more = screen.getByRole('button', { name: 'Loading more topics' });
    expect(more).toBeDisabled();
    fireEvent.click(more);
    expect(mocks.fetchMore).not.toHaveBeenCalled();
  });

  it('shows matching topic pills inline and hides pagination during search', () => {
    mocks.suggestions = [{ id: 'health', name: 'Health' }];
    mocks.search.results = [{ id: 'btc', name: 'Bitcoin' }];
    mocks.hasMore = true;
    render(<Picker />);
    search('crypto');

    expect(screen.getByRole('button', { name: 'Bitcoin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Health' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more topics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it("won't pick a hit from the previous query while the next one loads", () => {
    mocks.search = { results: [{ id: 'btc', name: 'Bitcoin' }], isSearching: true, isError: false, refetch: vi.fn() };
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    search('Mental health');

    const stale = screen.getByRole('button', { name: 'Bitcoin' });
    fireEvent.click(stale);

    expect(stale).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies search picks immediately and keeps them after clearing the search', () => {
    const bitcoin = { id: 'btc', name: 'Bitcoin' };
    const ethereum = { id: 'eth', name: 'Ethereum' };
    mocks.search.results = [bitcoin];
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    search('bitcoin');
    fireEvent.click(screen.getByRole('button', { name: 'Bitcoin' }));
    expect(onChange).toHaveBeenLastCalledWith([bitcoin]);

    mocks.search.results = [ethereum];
    search('ethereum');
    fireEvent.click(screen.getByRole('button', { name: 'Ethereum' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear topic search' }));

    expect(onChange).toHaveBeenLastCalledWith([bitcoin, ethereum]);
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Bitcoin' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ethereum' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Escape clears the query while preserving selected topics', () => {
    const topic = { id: 'btc', name: 'Bitcoin' };
    mocks.search.results = [topic];
    const onChange = vi.fn();
    render(<Picker initialSelected={[topic]} onChange={onChange} />);
    search('bitcoin');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Bitcoin' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses the known topic id when a search result has the same name', () => {
    mocks.suggestions = [{ id: 'known', name: 'Bitcoin' }];
    mocks.search.results = [{ id: 'duplicate', name: 'bitcoin' }];
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    search('bitcoin');
    fireEvent.click(screen.getByRole('button', { name: 'Bitcoin' }));

    expect(onChange).toHaveBeenCalledWith(mocks.suggestions);
  });

  it('lets a selected suggestion be deselected directly', () => {
    const topic = { id: 'btc', name: 'Bitcoin' };
    mocks.suggestions = [topic];
    const onChange = vi.fn();
    render(<Picker initialSelected={[topic]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bitcoin' }));

    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.getByRole('button', { name: 'Bitcoin' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers a retry when the spaces to suggest from failed to load', () => {
    const onRetryPrepare = vi.fn();
    render(<Picker failedToPrepare onRetryPrepare={onRetryPrepare} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText(/couldn.t load topics/)).toBeInTheDocument();
    expect(onRetryPrepare).toHaveBeenCalledOnce();
  });

  it('retries a failed search', () => {
    mocks.search = { results: [], isSearching: false, isError: true, refetch: vi.fn() };
    render(<Picker />);
    search('crypto');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mocks.search.refetch).toHaveBeenCalledOnce();
  });
});
