import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { startPlacement } from '~/core/blocks/ranking/ranking-placement';

import { RankingCompareDialog } from './ranking-compare-dialog';

afterEach(cleanup);

const Player = ({ label, badge }: { label: string; badge?: string }) => (
  <section aria-label={label}>
    <span>{badge}</span>
    <button type="button">Play</button>
  </section>
);

function renderCompare(onChoose = vi.fn()) {
  const start = startPlacement(3);
  if (start.done) throw new Error('expected a comparison');
  render(
    <RankingCompareDialog
      newDebate={{ entityId: 'new', name: 'New debate' }}
      existingDebate={{ entityId: 'old', name: 'Old debate' }}
      existingRank={2}
      search={start.search}
      onChoose={onChoose}
      onClose={vi.fn()}
      Player={Player as never}
    />
  );
  return onChoose;
}

describe('RankingCompareDialog', () => {
  it('labels each video on the picture and picks a side from anywhere on it but the player', () => {
    const onChoose = renderCompare();
    expect(screen.getByText('#2 in your ranking')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[0]!);
    expect(onChoose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Old debate'));
    expect(onChoose).toHaveBeenLastCalledWith('existing');
    fireEvent.click(screen.getByRole('button', { name: 'New debate was better' }));
    expect(onChoose).toHaveBeenLastCalledWith('new');
  });

  it('keeps About the same between the sides, with its key', () => {
    const onChoose = renderCompare();
    const same = screen.getByRole('button', { name: 'About the same' });
    expect(same.getAttribute('aria-keyshortcuts')).toBe('=');
    fireEvent.click(same);
    expect(onChoose).toHaveBeenCalledWith('same');
  });
});
