import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateEarlyEndLabels } from './debate-break-cues';

const names = { 1: 'Ada', 2: 'Grace' };
// Slot 2 ended early; slot 1 speaks next.
const cue = { endedSlot: 2 as const, nextSlot: 1 as const, ageMs: 0, durationMs: 1_000 };

const halves = (topSlot?: 1 | 2) => {
  const { container } = render(<DebateEarlyEndLabels cue={cue} names={names} playing={false} topSlot={topSlot} />);
  const ended = container.querySelector('[data-debate-early-end]') as HTMLElement;
  const turn = screen.getByText('Ada’s turn').parentElement as HTMLElement;
  const half = (element: HTMLElement) => (element.className.includes('top-0') ? 'top' : 'bottom');
  return { ended: half(ended), turn: half(turn) };
};

afterEach(cleanup);

describe('DebateEarlyEndLabels', () => {
  it('marks each debater’s own tile with slot 1 on top', () => {
    expect(halves()).toEqual({ ended: 'bottom', turn: 'top' });
  });

  // GEO-3833: the player draws the Agree speaker on top, so slot 2 can be the top tile.
  it('follows the tiles when slot 2 is drawn on top', () => {
    expect(halves(2)).toEqual({ ended: 'top', turn: 'bottom' });
  });
});
