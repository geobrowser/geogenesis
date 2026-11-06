import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { OpponentLeftDialog } from './opponent-left-dialog';

vi.mock('~/core/debates/matchmaking/use-focus-trap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

describe('OpponentLeftDialog', () => {
  it('offers Find debate and an X to close', () => {
    const onClose = vi.fn();
    const onFindDebate = vi.fn();

    render(<OpponentLeftDialog onClose={onClose} onFindDebate={onFindDebate} />);

    expect(screen.getByRole('dialog', { name: 'Opponent left' })).toBeInTheDocument();
    expect(
      screen.getByText('Your opponent left the debate. You can find another debate in the debate side panel!')
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onFindDebate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Find debate' }));
    expect(onFindDebate).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
