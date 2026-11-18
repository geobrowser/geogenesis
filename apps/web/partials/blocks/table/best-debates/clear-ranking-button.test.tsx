import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClearRankingButton } from './clear-ranking-button';

const mocks = vi.hoisted(() => ({ setToast: vi.fn() }));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));

afterEach(cleanup);
beforeEach(() => mocks.setToast.mockReset());

describe('Clear', () => {
  it('confirms, empties the draft, and Undo puts it back', () => {
    const setDraft = vi.fn();
    render(<ClearRankingButton orderedIds={['a', 'b', 'c']} setDraft={setDraft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Clear all 3 debates from your ranking?')).toBeTruthy();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Clear')!);
    expect(setDraft).toHaveBeenCalledWith([]);
    expect(screen.queryByRole('dialog')).toBeNull();

    cleanup();
    render(mocks.setToast.mock.calls.at(-1)?.[0] as React.ReactElement);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(setDraft).toHaveBeenLastCalledWith(['a', 'b', 'c']);
  });

  it('Cancel leaves the draft alone', () => {
    const setDraft = vi.fn();
    render(<ClearRankingButton orderedIds={['a']} setDraft={setDraft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(setDraft).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is not shown for an empty draft', () => {
    const { container } = render(<ClearRankingButton orderedIds={[]} setDraft={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
