import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
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
  it('turns the picks, then shows the result for the rest of the window', () => {
    expect(openRoundRevealStep(0, 3_000)).toBe('flip');
    expect(openRoundRevealStep(1_349, 3_000)).toBe('flip');
    expect(openRoundRevealStep(1_350, 3_000)).toBe('result');
    expect(openRoundRevealStep(2_999, 3_000)).toBe('result');
  });

  it('stretches with a longer window', () => {
    expect(openRoundRevealStep(2_000, 5_000)).toBe('flip');
    expect(openRoundRevealStep(2_250, 5_000)).toBe('result');
  });
});

describe('useOpenRoundRevealStep', () => {
  it('is null outside a result window', () => {
    const { result } = renderHook(() => useOpenRoundRevealStep(null, 3_000));
    expect(result.current).toBeNull();
  });

  it('reaches the result on time between the room clock ticks', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOpenRoundRevealStep(600, 3_000));
    expect(result.current).toBe('flip');

    act(() => vi.advanceTimersByTime(1_350 - 601));
    expect(result.current).toBe('flip');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('result');
  });

  it('follows the room clock when it ticks', () => {
    const { result, rerender } = renderHook(({ elapsed }) => useOpenRoundRevealStep(elapsed, 3_000), {
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
  it('announces a new round and counts down to whoever opens it', () => {
    const { container } = render(
      <OpenRoundResultOverlay result={{ kind: 'round', round: 2, opener: 'Alice', seconds: 2 }} />
    );
    expect(container).toHaveTextContent('Round2Alice opens in 2');
  });

  it('says "You open" to the opener, and drops the count once the round is due', () => {
    const { rerender } = render(
      <OpenRoundResultOverlay result={{ kind: 'round', round: 1, opener: 'You', seconds: 1 }} />
    );
    expect(screen.getByText('You open in 1')).toBeInTheDocument();
    rerender(<OpenRoundResultOverlay result={{ kind: 'round', round: 1, opener: 'You', seconds: 0 }} />);
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
    const { container } = render(
      <OpenRoundResultOverlay result={{ kind: 'round', round: 1, opener: 'You', seconds: 2 }} />
    );
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
