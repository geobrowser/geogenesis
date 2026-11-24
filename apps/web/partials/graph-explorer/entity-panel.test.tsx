import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClaimsTab } from './entity-panel';

afterEach(cleanup);

const state = (hasNextPage: boolean) => ({
  isLoading: false,
  isError: false,
  hasNextPage,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
});

describe('ClaimsTab', () => {
  it('keeps paging when the loaded pages decode to no claims but more pages exist', () => {
    const more = state(true);
    render(<ClaimsTab pages={[[], []]} state={more} emptyMessage="No claims about this." />);
    expect(screen.getByText('None of the claims loaded so far can be shown here.')).toBeTruthy();
    expect(screen.queryByText('No claims about this.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show more claims' }));
    expect(more.fetchNextPage).toHaveBeenCalled();
  });

  it('says there are none only once there are no more pages', () => {
    render(<ClaimsTab pages={[[]]} state={state(false)} emptyMessage="No claims about this." />);
    expect(screen.getByText('No claims about this.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show more claims' })).toBeNull();
  });
});
