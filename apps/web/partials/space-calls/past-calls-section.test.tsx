import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SpacePastCall } from '~/core/space-calls/series/past-calls';

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  fetchNextPage: vi.fn(),
}));

vi.mock('~/core/space-calls/series/past-calls', () => ({ useSpacePastCalls: () => mocks.query }));

const { PastCallsSection } = await import('./past-calls-section');

afterEach(() => {
  cleanup();
  mocks.fetchNextPage.mockReset();
});

const call = (over: Partial<SpacePastCall>): SpacePastCall => ({
  call_id: 'c1',
  name: 'Weekly call',
  started_at: '2026-10-23T15:00:02Z',
  ended_at: '2026-10-23T16:31:40Z',
  duration_seconds: 5498,
  started_by: null,
  recording: null,
  ...over,
});

function pages(calls: SpacePastCall[], next: string | null) {
  mocks.query = {
    data: { pages: [{ calls, next_cursor: next }] },
    isError: false,
    hasNextPage: next !== null,
    isFetchingNextPage: false,
    fetchNextPage: mocks.fetchNextPage,
  };
}

describe('PastCallsSection', () => {
  it('lists ended calls with their length and a recording tag, and pages on', () => {
    pages([call({}), call({ call_id: 'c2', name: 'Recorded', recording: { duration_seconds: 5310 } })], 'cur1');
    render(<PastCallsSection spaceId="space1" />);
    expect(screen.getByRole('link', { name: 'Weekly call' })).toHaveAttribute('href', '/space/space1/calls/c1');
    expect(screen.getAllByText(/1h 32m/)).toHaveLength(2);
    expect(screen.getAllByText('Recording')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });

  it('says when there are none, with no Show more', () => {
    pages([], null);
    render(<PastCallsSection spaceId="space1" />);
    expect(screen.getByText('No past calls yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says when they could not load', () => {
    mocks.query = { data: undefined, isError: true };
    render(<PastCallsSection spaceId="space1" />);
    expect(screen.getByText('Could not load past calls.')).toBeInTheDocument();
  });
});
