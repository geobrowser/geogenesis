import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OpenRoundPickReveal,
  OpenRoundResultOverlay,
  openRoundRevealStep,
  openRoundWrapNote,
  useOpenRoundReveal,
  useOpenRoundRevealStep,
} from './open-round-reveal';
import { revealEnd, revealRebut, timedOut } from './open-rounds-fixtures';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('openRoundRevealStep', () => {
  it('turns the picks, then shows the result for the rest of the window', () => {
    expect(openRoundRevealStep(0, 'end', 3_000)).toBe('flip');
    expect(openRoundRevealStep(1_349, 'end', 3_000)).toBe('flip');
    expect(openRoundRevealStep(1_350, 'end', 3_000)).toBe('result');
    expect(openRoundRevealStep(2_999, 'end', 3_000)).toBe('result');
  });

  it('counts the opener in once the window closes after an Extend', () => {
    expect(openRoundRevealStep(2_999, 'extend', 3_000)).toBe('result');
    expect(openRoundRevealStep(3_000, 'extend', 3_000)).toBe('countIn');
    expect(openRoundRevealStep(7_999, 'extend', 3_000)).toBe('countIn');
  });

  it('stretches the flip with a longer window', () => {
    expect(openRoundRevealStep(2_000, 'end', 5_000)).toBe('flip');
    expect(openRoundRevealStep(2_250, 'end', 5_000)).toBe('result');
  });
});

describe('useOpenRoundRevealStep', () => {
  it('is null outside a result window', () => {
    const { result } = renderHook(() => useOpenRoundRevealStep(null, null, 3_000));
    expect(result.current).toBeNull();
  });

  it('reaches each step on time between the room clock ticks', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOpenRoundRevealStep(600, 'extend', 3_000));
    expect(result.current).toBe('flip');

    act(() => vi.advanceTimersByTime(1_350 - 600));
    expect(result.current).toBe('result');

    act(() => vi.advanceTimersByTime(3_000 - 1_350));
    expect(result.current).toBe('countIn');
  });

  it('follows the room clock when it ticks', () => {
    const { result, rerender } = renderHook(({ elapsed }) => useOpenRoundRevealStep(elapsed, 'end', 3_000), {
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
  it('announces a new round and who opens it, with no count', () => {
    const { container } = render(<OpenRoundResultOverlay result={{ kind: 'round', round: 2, opener: 'Alice' }} />);
    expect(container).toHaveTextContent('Round2Alice opens');
    expect(container.textContent).not.toMatch(/ in \d/);
  });

  it('says "You open" to the opener', () => {
    render(<OpenRoundResultOverlay result={{ kind: 'round', round: 1, opener: null }} />);
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
    const { container } = render(<OpenRoundResultOverlay result={{ kind: 'round', round: 1, opener: null }} />);
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

describe('useOpenRoundReveal', () => {
  const resolvedRebut = {
    phase: 'result' as const,
    roundIndex: 0,
    isFinalRound: false as const,
    outcome: 'extend' as const,
    resolvedAtMs: 0,
    nextPhaseStartsAtMs: 8_000,
  };
  const bob = { slot: 2 as const, name: 'Bob' };
  const reveal = (input: Partial<Parameters<typeof useOpenRoundReveal>[0]>) =>
    renderHook(() =>
      useOpenRoundReveal({
        debate: revealRebut(),
        phase: resolvedRebut,
        effectiveStatus: 'in_progress',
        elapsedMs: 0,
        remainingSeconds: 8,
        localSlot: 1,
        remote: bob,
        ...input,
      })
    ).result.current;

  it('turns both picks over first, with nothing announced', () => {
    const current = reveal({ elapsedMs: 500 });
    expect(current.step).toBe('flip');
    expect(current.localPick?.pick).toBe('extend');
    expect(current.remotePick?.pick).toBe('extend');
    expect(current.result).toBeNull();
    expect(current.holdsCountIn).toBe(true);
    expect(current.announcement).toBe('You: Extend. Bob: Extend.');
  });

  it('announces the new round to its opener as "You", and moves the counter to it', () => {
    const current = reveal({ elapsedMs: 2_000 });
    expect(current.result).toEqual({ kind: 'round', round: 1, opener: null });
    expect(current.localPick).toBeNull();
    expect(current.chipsHidden).toBe(true);
    expect(current.announcedRoundPhase).toMatchObject({ phase: 'speaking', roundIndex: 1 });
  });

  it('names the opener to the other debater, and keeps it up through the count-in', () => {
    const current = reveal({ elapsedMs: 4_000, localSlot: 2, remote: { slot: 1, name: 'Alice' } });
    expect(current.step).toBe('countIn');
    expect(current.result).toEqual({ kind: 'round', round: 1, opener: 'Alice' });
  });

  it("clears the opener's tiles for their count-in", () => {
    const current = reveal({ elapsedMs: 4_000 });
    expect(current.result).toBeNull();
    expect(current.holdsCountIn).toBe(false);
  });

  it('keeps the picks up beside a wrap, with the reason when a pick was missing', () => {
    const current = reveal({
      debate: timedOut(),
      phase: { ...resolvedRebut, outcome: 'end', nextPhaseStartsAtMs: 3_000 },
      elapsedMs: 2_000,
    });
    expect(current.result).toEqual({ kind: 'wrap', note: "Bob didn't pick in time" });
    expect(current.remotePick).toEqual({ participant_slot: 2, pick: null });
    expect(current.pickPlacement).toBe('apart');
  });

  it('holds the wrap into the start of thanking, then lets the end card through', () => {
    const finished = { phase: 'finished' as const, roundIndex: 0, isFinalRound: false };
    const held = reveal({ debate: revealEnd(), phase: finished, effectiveStatus: 'thanking', elapsedMs: 1_000 });
    expect(held.result).toMatchObject({ kind: 'wrap' });
    expect(held.holdsEndCard).toBe(true);

    const released = reveal({ debate: revealEnd(), phase: finished, effectiveStatus: 'thanking', elapsedMs: 1_600 });
    expect(released.result).toBeNull();
    expect(released.holdsEndCard).toBe(false);
  });

  it('says the cap was reached at the start of thanking after the last round', () => {
    const current = reveal({
      phase: { phase: 'finished', roundIndex: 10, isFinalRound: true },
      effectiveStatus: 'thanking',
      elapsedMs: 1_000,
    });
    expect(current.result).toEqual({ kind: 'max', rounds: 10 });
    expect(current.holdsEndCard).toBe(true);
    expect(current.announcement).toBe("That's the max: 10 rebuttal rounds.");
  });

  it('does nothing for a fixed format', () => {
    const { open_rounds: _openRounds, ...fixed } = revealRebut();
    const current = reveal({ debate: fixed, phase: null });
    expect(current.step).toBeNull();
    expect(current.result).toBeNull();
    expect(current.holdsEndCard).toBe(false);
    expect(current.holdsCountIn).toBe(false);
  });
});
