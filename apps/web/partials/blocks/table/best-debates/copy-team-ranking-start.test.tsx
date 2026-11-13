import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyTeamRankingStart } from './copy-team-ranking-start';

const mocks = vi.hoisted(() => ({ setToast: vi.fn() }));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));

afterEach(cleanup);
beforeEach(() => mocks.setToast.mockReset());

const base = {
  teamOrder: ['a', 'b', 'c'],
  isTeamOrderLoading: false,
  hasRanking: false,
  draftIsEmpty: true,
  pushedDownIds: ['b'],
  maxItems: 100,
};

describe('Start from the team ranking', () => {
  it('copies the team order, minus pushed-down debates, into the draft only', () => {
    const setDraft = vi.fn();
    render(<CopyTeamRankingStart {...base} setDraft={setDraft} />);
    expect(screen.getByText(/Copies the team's 2 debates in order/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start from the team ranking' }));
    expect(setDraft).toHaveBeenCalledWith(['a', 'c']);
  });

  it('offers Undo, which empties the draft again', () => {
    const setDraft = vi.fn();
    render(<CopyTeamRankingStart {...base} setDraft={setDraft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start from the team ranking' }));
    cleanup();
    render(mocks.setToast.mock.calls.at(-1)?.[0] as React.ReactElement);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(setDraft).toHaveBeenLastCalledWith([]);
    expect(mocks.setToast).toHaveBeenLastCalledWith(null);
  });

  it('says when the team order is longer than a ranking can hold', () => {
    const setDraft = vi.fn();
    render(<CopyTeamRankingStart {...base} pushedDownIds={[]} maxItems={2} setDraft={setDraft} />);
    expect(screen.getByText(/top 2 of 3 debates/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start from the team ranking' }));
    expect(setDraft).toHaveBeenCalledWith(['a', 'b']);
  });

  it('is hidden when the viewer has a ranking, has a draft, or the team ranking is empty', () => {
    const { rerender, container } = render(<CopyTeamRankingStart {...base} hasRanking setDraft={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    rerender(<CopyTeamRankingStart {...base} draftIsEmpty={false} setDraft={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    rerender(<CopyTeamRankingStart {...base} teamOrder={[]} setDraft={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('waits on the team order with a disabled button and a placeholder count', () => {
    render(<CopyTeamRankingStart {...base} teamOrder={[]} isTeamOrderLoading setDraft={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Start from the team ranking' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByTestId('copy-team-count-skeleton')).toBeTruthy();
  });
});
