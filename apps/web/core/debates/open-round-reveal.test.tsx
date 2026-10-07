import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OPEN_ROUND_COUNT_IN_MS,
  OPEN_ROUND_FLIP_MS,
  OpenRoundPickReveal,
  OpenRoundResultOverlay,
  openRoundRevealStep,
  openRoundWrapNote,
  useOpenRoundRevealStep,
} from './open-round-reveal';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('openRoundRevealStep', () => {
  it('turns the picks, then shows the result', () => {
    expect(openRoundRevealStep(0, 'end')).toBe('flip');
    expect(openRoundRevealStep(OPEN_ROUND_FLIP_MS - 1, 'end')).toBe('flip');
    expect(openRoundRevealStep(OPEN_ROUND_FLIP_MS, 'end')).toBe('result');
    expect(openRoundRevealStep(2_999, 'end')).toBe('result');
  });

  it('counts the opener in after an Extend', () => {
    expect(openRoundRevealStep(OPEN_ROUND_COUNT_IN_MS - 1, 'extend')).toBe('result');
    expect(openRoundRevealStep(OPEN_ROUND_COUNT_IN_MS, 'extend')).toBe('countIn');
  });
});

describe('useOpenRoundRevealStep', () => {
  it('is null outside a result window', () => {
    const { result } = renderHook(() => useOpenRoundRevealStep(null, null));
    expect(result.current).toBeNull();
  });

  it('reaches each step on time between the room clock ticks', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOpenRoundRevealStep(600, 'extend'));
    expect(result.current).toBe('flip');

    act(() => vi.advanceTimersByTime(OPEN_ROUND_FLIP_MS - 600));
    expect(result.current).toBe('result');

    act(() => vi.advanceTimersByTime(OPEN_ROUND_COUNT_IN_MS - OPEN_ROUND_FLIP_MS));
    expect(result.current).toBe('countIn');
  });

  it('follows the room clock when it ticks', () => {
    const { result, rerender } = renderHook(({ elapsed }) => useOpenRoundRevealStep(elapsed, 'end'), {
      initialProps: { elapsed: 200 },
    });
    rerender({ elapsed: 1_600 });
    expect(result.current).toBe('result');
  });
});

describe('OpenRoundPickReveal', () => {
  it('flips from the name to the pick', () => {
    const { container } = render(<OpenRoundPickReveal name="Bob" pick="extend" />);
    expect(container.firstChild).toHaveAttribute('data-open-round-reveal', 'extend');
    expect(container).toHaveTextContent('Bob');
    expect(screen.getByText('Extend')).toHaveClass('uppercase');
  });

  it('shows a missing pick as no pick, counted as End', () => {
    const { container } = render(<OpenRoundPickReveal name="Bob" pick={null} />);
    expect(container.firstChild).toHaveAttribute('data-open-round-reveal', 'none');
    expect(screen.getByText('No pick')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });

  it('rests on the pick side, and only animates for those who allow motion', () => {
    const { container } = render(<OpenRoundPickReveal name="Bob" pick="end" />);
    const card = container.querySelector('.transform-3d');
    expect(card).toHaveClass('rotate-y-180', 'motion-safe:animate-open-round-flip');
    expect(card?.className).not.toMatch(/(^| )animate-/);
  });
});

describe('OpenRoundResultOverlay', () => {
  it('announces a new round and who opens it', () => {
    const { container } = render(<OpenRoundResultOverlay result={{ kind: 'round', round: 2, opener: 'Alice' }} />);
    expect(container).toHaveTextContent('Round2Alice opens');
  });

  it('says "You open" to the opener', () => {
    render(<OpenRoundResultOverlay result={{ kind: 'round', round: 1, opener: 'You' }} />);
    expect(screen.getByText('You open')).toBeInTheDocument();
  });

  it('ends with a reason only when there is one', () => {
    const { container, rerender } = render(<OpenRoundResultOverlay result={{ kind: 'wrap', note: null }} />);
    expect(container.textContent).toBe("That's a wrap");
    rerender(<OpenRoundResultOverlay result={{ kind: 'wrap', note: 'No picks in time' }} />);
    expect(container).toHaveTextContent("That's a wrapNo picks in time");
  });

  it('says the debate hit the maximum', () => {
    const { container } = render(<OpenRoundResultOverlay result={{ kind: 'max', rounds: 10 }} />);
    expect(container).toHaveTextContent("That's the max10 rebuttal rounds");
  });

  it('drops the burst for reduced motion', () => {
    const { container } = render(<OpenRoundResultOverlay result={{ kind: 'round', round: 1, opener: 'You' }} />);
    expect(container.querySelector('.motion-reduce\\:hidden')).toBeInTheDocument();
  });
});

describe('openRoundWrapNote', () => {
  it('names whoever did not pick', () => {
    expect(openRoundWrapNote(null, { name: 'Bob', pick: null })).toBe('No picks in time');
    expect(openRoundWrapNote(null, { name: 'Bob', pick: 'extend' })).toBe("You didn't pick in time");
    expect(openRoundWrapNote('extend', { name: 'Bob', pick: null })).toBe("Bob didn't pick in time");
  });

  it('says nothing for a split or an unknown pick', () => {
    expect(openRoundWrapNote('extend', { name: 'Bob', pick: 'end' })).toBeNull();
    expect(openRoundWrapNote(undefined, { name: 'Bob', pick: undefined })).toBeNull();
  });
});
