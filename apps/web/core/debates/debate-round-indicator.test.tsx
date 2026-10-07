import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateRoundIndicator } from './debate-round-indicator';
import type { OpenRoundsRoomPhase } from './open-rounds';

const speaking = (roundIndex: number): OpenRoundsRoomPhase => ({
  phase: 'speaking',
  roundIndex,
  isFinalRound: roundIndex >= 10,
});

const result = (roundIndex: number, outcome: 'extend' | 'end'): OpenRoundsRoomPhase => ({
  phase: 'result',
  roundIndex,
  isFinalRound: false,
  outcome,
  resolvedAtMs: 0,
  nextPhaseStartsAtMs: 3_000,
});

function renderIndicator(phase: OpenRoundsRoomPhase, maxRounds = 10) {
  render(<DebateRoundIndicator phase={phase} maxRounds={maxRounds} />);
  const pips = Array.from(document.querySelectorAll('[data-round-pip]')).map(pip => pip.getAttribute('data-round-pip'));
  return { pips };
}

describe('DebateRoundIndicator', () => {
  afterEach(cleanup);

  it('shows the opening with one open pip and room for another round', () => {
    const { pips } = renderIndicator(speaking(0));

    expect(screen.getByText('Opening')).toBeInTheDocument();
    expect(screen.getByText('Opening. No rebuttal rounds yet. Another round is possible.')).toBeInTheDocument();
    expect(pips).toEqual(['0', 'next']);
    expect(document.querySelector('[data-round-pip="0"]')).toHaveClass('bg-purple');
  });

  it('shows round N of the cap, one pip per round run, and highlights the current one', () => {
    const { pips } = renderIndicator(speaking(4));

    expect(screen.getByText('Round 4')).toBeInTheDocument();
    expect(screen.getByText('of 10')).toBeInTheDocument();
    expect(screen.getByText('Round 4 of 10. 4 rebuttal rounds so far. Another round is possible.')).toBeInTheDocument();
    expect(pips).toEqual(['0', '1', '2', '3', '4', 'next']);
    expect(document.querySelector('[data-round-pip="4"]')).toHaveClass('bg-purple');
    expect(document.querySelector('[data-round-pip="3"]')).not.toHaveClass('bg-purple');
  });

  it('reads the cap from the debate rather than assuming 10', () => {
    renderIndicator(speaking(2), 3);

    expect(screen.getByText('of 3')).toBeInTheDocument();
  });

  it('marks the cap round as the last, with no further round possible and compact pips', () => {
    const { pips } = renderIndicator(speaking(10));

    expect(screen.getByText('Round 10')).toBeInTheDocument();
    expect(screen.getByText('· last')).toBeInTheDocument();
    expect(screen.getByText('Round 10 of 10. 10 rebuttal rounds so far. No more rounds.')).toBeInTheDocument();
    expect(pips).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    // Halved past five rounds so round 10 fits beside Leave on a phone.
    expect(document.querySelector('[data-round-pip="10"]')).toHaveClass('w-1.5');
    expect(document.querySelector('[data-round-pip="0"]')).toHaveClass('w-2.5');
  });

  it('keeps the resolved round during its reveal, and drops the next pip once it resolves End', () => {
    const { pips } = renderIndicator(result(2, 'end'));

    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(pips).toEqual(['0', '1', '2']);
  });

  it('keeps the next pip while an Extend reveal plays', () => {
    const { pips } = renderIndicator(result(2, 'extend'));

    expect(pips).toEqual(['0', '1', '2', 'next']);
  });

  it('highlights no round once the debate has finished', () => {
    const { pips } = renderIndicator({ phase: 'finished', roundIndex: 3, isFinalRound: false });

    expect(pips).toEqual(['0', '1', '2', '3']);
    expect(document.querySelector('.bg-purple')).toBeNull();
  });
});
