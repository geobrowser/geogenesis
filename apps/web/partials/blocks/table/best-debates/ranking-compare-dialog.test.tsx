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

  it('fills the bar button for the side being hovered, and has no per-side buttons', () => {
    renderCompare();
    const left = screen.getByRole('button', { name: 'New debate was better' });
    expect(left.className).not.toContain('bg-text');
    fireEvent.mouseEnter(screen.getByTestId('compare-card-new'));
    expect(left.className).toContain('bg-text');
    fireEvent.mouseLeave(screen.getByTestId('compare-card-new'));
    expect(left.className).not.toContain('bg-text');
    expect(screen.queryByText('This one')).toBeNull();
  });

  it('fills a side’s button when the button itself is hovered, and Same tints neither side', () => {
    renderCompare();
    const right = screen.getByRole('button', { name: 'Old debate was better' });
    fireEvent.mouseEnter(right);
    expect(right.className).toContain('bg-text');
    expect(screen.getByTestId('compare-card-existing').className).toContain('bg-grey-01');
    fireEvent.mouseLeave(right);
    const same = screen.getByRole('button', { name: 'About the same' });
    fireEvent.mouseEnter(same);
    expect(screen.getByTestId('compare-card-existing').className).not.toContain('bg-grey-01');
    expect(screen.getByTestId('compare-card-new').className).not.toContain('bg-grey-01');
    expect(right.className).not.toContain('bg-text');
  });

  it('never picks from a click on the video, and does not tint the side for it', () => {
    const onChoose = renderCompare();
    const video = screen.getByRole('region', { name: 'Old debate' });
    fireEvent.mouseOver(video);
    expect(screen.getByTestId('compare-card-existing').className).not.toContain('bg-grey-01');
    fireEvent.click(video);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('puts the bar above the sides with ?compareBar=top (dev toggle)', () => {
    window.history.replaceState(null, '', '/?compareBar=top');
    renderCompare();
    const bar = screen.getByRole('button', { name: 'About the same' });
    const side = screen.getByTestId('compare-card-new');
    expect(bar.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    window.history.replaceState(null, '', '/');
  });
});
