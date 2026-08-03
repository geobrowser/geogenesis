import { fireEvent, render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { RankingBlockGlobalPagination } from './ranking-block-global-pagination';

describe('RankingBlockGlobalPagination', () => {
  it('renders arrow-only pagination and changes pages in either direction', () => {
    const onSetPage = vi.fn();

    const { container } = render(<RankingBlockGlobalPagination hasPreviousPage hasNextPage onSetPage={onSetPage} />);

    const previousButton = screen.getByRole('button', { name: 'Previous page' });
    const nextButton = screen.getByRole('button', { name: 'Next page' });

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(container.textContent).toBe('');

    fireEvent.click(previousButton);
    fireEvent.click(nextButton);

    expect(onSetPage).toHaveBeenNthCalledWith(1, 'previous');
    expect(onSetPage).toHaveBeenNthCalledWith(2, 'next');
  });
});
