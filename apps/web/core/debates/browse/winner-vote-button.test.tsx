import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { WinnerVoteButton } from './winner-vote-button';

afterEach(cleanup);

const renderButton = (props: Partial<React.ComponentProps<typeof WinnerVoteButton>> = {}) =>
  render(
    <WinnerVoteButton debaterName="Aaliyah Johnson" sharePercent={null} isMyPick={false} onVote={vi.fn()} {...props} />
  );

describe('WinnerVoteButton', () => {
  it('offers a vote before the viewer has voted', async () => {
    const onVote = vi.fn();
    renderButton({ onVote });

    const button = screen.getByRole('button', { name: 'Vote Aaliyah Johnson as the winner' });
    expect(button).toHaveTextContent('Winner?');

    await userEvent.click(button);
    expect(onVote).toHaveBeenCalledOnce();
  });

  it('shows a static share on the viewer’s pick', () => {
    renderButton({ sharePercent: 65, isMyPick: true });

    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Winner?')).not.toBeInTheDocument();
  });

  it('lets the viewer switch by clicking the other debater’s share', async () => {
    const onVote = vi.fn();
    renderButton({ sharePercent: 35, isMyPick: false, onVote });

    const button = screen.getByRole('button', { name: 'Vote Aaliyah Johnson as the winner' });
    expect(button).toHaveTextContent('35%');
    expect(screen.queryByText('Winner?')).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(onVote).toHaveBeenCalledOnce();
  });

  // Figma "Winners voted on": the debater the viewer picked gets the purple pill with a white
  // label; the other reads against its surface — white on the video, grey-02 on the claims panel.
  it('fills the viewer’s pick with the purple pill', () => {
    const { container } = renderButton({ sharePercent: 65, isMyPick: true });
    expect(container.firstElementChild).toHaveClass('bg-[#9A4EFF]', 'text-white');
  });

  it('leaves the other debater’s pill unpurpled', () => {
    const { container } = renderButton({ sharePercent: 35, isMyPick: false });
    expect(container.firstElementChild).not.toHaveClass('bg-[#9A4EFF]');
    expect(container.firstElementChild).toHaveClass('bg-white', 'text-text');
  });

  it('darkens the other debater’s pill on the claims panel', () => {
    const { container } = renderButton({ sharePercent: 35, isMyPick: false, surface: 'panel' });
    expect(container.firstElementChild).toHaveClass('bg-grey-02', 'text-text');
  });

  it('blocks a second click while a vote is publishing', async () => {
    const onVote = vi.fn();
    renderButton({ onVote, disabled: true });

    await userEvent.click(screen.getByRole('button'));
    expect(onVote).not.toHaveBeenCalled();
  });

  // The pill sits on top of the video's play/pause hit area, so the click must not bubble.
  it('does not bubble the click to the video underneath', async () => {
    const onVote = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <WinnerVoteButton debaterName="Peter Feldip" sharePercent={null} isMyPick={false} onVote={onVote} />
      </div>
    );

    await userEvent.click(screen.getByRole('button'));
    expect(onVote).toHaveBeenCalledOnce();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
