import { fireEvent, render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { RankingBlockGlobalPagination } from './ranking-block-global-pagination';

describe('RankingBlockGlobalPagination', () => {
  it('renders arrow-only pagination and changes pages in either direction', () => {
    const onSetPage = vi.fn();

    const { container } = render(<RankingBlockGlobalPagination hasPreviousPage hasNextPage onSetPage={onSetPage} />);

    const buttons = screen.getAllByRole('button');

    expect(buttons).toHaveLength(2);
    expect(container.textContent).toBe('');

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(onSetPage).toHaveBeenNthCalledWith(1, 'previous');
    expect(onSetPage).toHaveBeenNthCalledWith(2, 'next');
  });
});
