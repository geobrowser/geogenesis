import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BestDebatesTopicSearchRow } from './best-debates-team-tools';

afterEach(cleanup);

const facet = {
  pending: false,
  topics: [
    { id: 'economy', name: 'Economy', count: 12 },
    { id: 'energy', name: 'Energy policy', count: 4 },
    { id: 'dating', name: 'Dating', count: 30 },
  ],
};

describe('BestDebatesTopicSearchRow', () => {
  it('offers the topics matching the search, with whole-list counts, and picks into the shared selection', () => {
    const toggleTopic = vi.fn();
    const onPicked = vi.fn();
    render(
      <BestDebatesTopicSearchRow
        query="e"
        facet={facet}
        tools={{ topicIds: [], toggleTopic, clearTopics: vi.fn() }}
        onPicked={onPicked}
      />
    );

    const economy = screen.getByRole('button', { name: 'Filter by Economy' });
    expect(economy.textContent).toContain('12');
    expect(screen.getByRole('button', { name: 'Filter by Energy policy' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Filter by Dating' })).toBeNull();

    fireEvent.click(economy);
    expect(toggleTopic).toHaveBeenCalledWith('economy');
    expect(onPicked).toHaveBeenCalled();
  });

  it('shows the picked topics as chips that take the filter off', () => {
    const toggleTopic = vi.fn();
    render(
      <BestDebatesTopicSearchRow
        query=""
        facet={facet}
        tools={{ topicIds: ['dating'], toggleTopic, clearTopics: vi.fn() }}
        onPicked={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Dating filter' }));
    expect(toggleTopic).toHaveBeenCalledWith('dating');
  });
});
