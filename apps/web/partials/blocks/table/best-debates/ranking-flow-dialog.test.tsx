import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { RankingFlowDialog } from './ranking-flow-dialog';

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
});
