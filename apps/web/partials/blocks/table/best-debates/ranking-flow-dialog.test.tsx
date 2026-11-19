import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RankingFlowDialog } from './ranking-flow-dialog';
import { RANKING_TOAST_ATTRIBUTE } from './use-removed-toast';

afterEach(cleanup);

describe('RankingFlowDialog', () => {
  // GEO-3728: the watch dialog's columns scroll themselves, so its player never scrolls away.
  it('lets only the watch size hold its body still', () => {
    render(
      <RankingFlowDialog open onClose={() => undefined} title="Watch" size="watch">
        <p>body</p>
      </RankingFlowDialog>
    );
    expect(screen.getByTestId('ranking-flow-dialog-body')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('ranking-flow-dialog-body')).not.toHaveClass('overflow-y-auto');
  });

  it.each(['compare', undefined] as const)('scrolls the body of the %s size as before', size => {
    render(
      <RankingFlowDialog open onClose={() => undefined} title="Compare" size={size}>
        <p>body</p>
      </RankingFlowDialog>
    );
    expect(screen.getByTestId('ranking-flow-dialog-body')).toHaveClass('overflow-y-auto');
    expect(screen.getByRole('dialog').className).not.toContain('h-[min(760px');
  });

  // GEO-3805: Undo on Removed “Name”. while the watch popup is open acts on the popup's debate.
  it('stays open for a press on a ranking toast, and closes for any other press outside', async () => {
    const onClose = vi.fn();
    render(
      <>
        <RankingFlowDialog open onClose={onClose} title="Watch" size="watch">
          <p>body</p>
        </RankingFlowDialog>
        <span {...{ [RANKING_TOAST_ATTRIBUTE]: '' }}>
          <button type="button">Undo</button>
        </span>
        <button type="button">Elsewhere</button>
      </>
    );
    // Radix listens for presses outside from the next tick, and acts on the press's click.
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
    const press = (element: HTMLElement) => {
      fireEvent.pointerDown(element);
      fireEvent.click(element);
    };
    press(screen.getByText('Undo'));
    expect(onClose).not.toHaveBeenCalled();
    press(screen.getByText('Elsewhere'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
