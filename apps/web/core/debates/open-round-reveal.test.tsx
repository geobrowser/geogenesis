import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OpenRoundPickStamp,
  OpenRoundResultOverlay,
  openRoundRevealStep,
  openRoundWrapNote,
  useOpenRoundReveal,
  useOpenRoundRevealStep,
} from './open-round-reveal';
import { requiredRoundListening, revealEnd, revealRebut, timedOut } from './open-rounds-fixtures';

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

  it('skips the flip when there are no picks to turn, as in a lead-in', () => {
    expect(openRoundRevealStep(0, 'extend', 3_000, false)).toBe('result');
    expect(openRoundRevealStep(3_000, 'extend', 3_000, false)).toBe('countIn');
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

  it('starts every round at the flip, whatever the previous round reached', () => {
    vi.useFakeTimers();
    // Round 0: the room samples 600 ms, and the hook's own timer carries it on to the result.
    const { result, rerender } = renderHook(
      ({ elapsed }: { elapsed: number | null }) => useOpenRoundRevealStep(elapsed, 'extend', 3_000),
      { initialProps: { elapsed: 600 as number | null } }
    );
    act(() => vi.advanceTimersByTime(1_350 - 600));
    expect(result.current).toBe('result');

    // A round is spoken between the two reveals.
    rerender({ elapsed: null });
    expect(result.current).toBeNull();

    // Round 1's first sample happens to land on the same 600 ms.
    rerender({ elapsed: 600 });
    expect(result.current).toBe('flip');
  });

  it('follows the room clock when it ticks', () => {
    const { result, rerender } = renderHook(({ elapsed }) => useOpenRoundRevealStep(elapsed, 'end', 3_000), {
      initialProps: { elapsed: 200 },
    });
    rerender({ elapsed: 1_600 });
    expect(result.current).toBe('result');
  });
});

describe('OpenRoundPickStamp (GEO-3315)', () => {
  it('stamps the pick onto the tile in its ink', () => {
    const { container } = render(<OpenRoundPickStamp pick="extend" order="first" />);
    expect(container.firstChild).toHaveAttribute('data-open-round-reveal', 'extend');
    expect(screen.getByText('Extend')).toHaveClass('text-purple', 'uppercase');
    expect(screen.getByText('Extend')).toHaveStyle({ transform: 'rotate(-3.2deg)' });
  });

  it('stamps a missing pick as a grey dashed no pick, neither Extend nor End', () => {
    const { container } = render(<OpenRoundPickStamp pick={null} order="first" />);
    expect(container.firstChild).toHaveAttribute('data-open-round-reveal', 'none');
    expect(screen.getByText('No pick')).toHaveClass('border-dashed', 'text-grey-04');
    expect(screen.queryByText('End')).not.toBeInTheDocument();
    expect(screen.queryByText('Extend')).not.toBeInTheDocument();
  });

  it('lands the second stamp a beat later, leaning the other way, and only animates for those who allow motion', () => {
    render(<OpenRoundPickStamp pick="end" order="second" />);
    const stamp = screen.getByText('End');
    expect(stamp).toHaveClass('text-text', 'motion-safe:animate-debate-stamp');
    expect(stamp.className).not.toMatch(/(^| )animate-/);
    expect(stamp).toHaveStyle({ transform: 'rotate(2.4deg)', animationDelay: '280ms' });
  });
});

describe('OpenRoundResultOverlay', () => {
  it('announces a new round as a two-line banner, with who opens it and no count', () => {
    const { container } = render(
      <OpenRoundResultOverlay result={{ kind: 'round', round: 2, label: 'Round 2 · Rebuttal', opener: 'Alice' }} />
    );
    expect(container.querySelector('[data-open-round-banner]')).toHaveClass('bg-purple');
    expect(container).toHaveTextContent('Round 2 · RebuttalAlice opens');
    expect(container.textContent).not.toMatch(/ in \d/);
  });

  it('says "You open" to the opener', () => {
    render(<OpenRoundResultOverlay result={{ kind: 'round', round: 2, label: 'Round 2 · Rebuttal', opener: null }} />);
    expect(screen.getByText('You open')).toBeInTheDocument();
  });

  it('ends with a purple banner, and a reason only when there is one', () => {
    const { container, rerender } = render(<OpenRoundResultOverlay result={{ kind: 'wrap', note: null }} />);
    expect(container.textContent).toBe('That’s a wrap');
    expect(container.querySelector('[data-open-round-banner]')).toHaveClass('bg-purple');
    rerender(<OpenRoundResultOverlay result={{ kind: 'wrap', note: 'No picks in time' }} />);
    expect(container).toHaveTextContent('That’s a wrapNo picks in time');
  });

  it('says the debate hit the maximum, with every round run, the opening included, as a purple tag', () => {
    const { container } = render(<OpenRoundResultOverlay result={{ kind: 'max', rounds: 10 }} />);
    expect(container).toHaveTextContent('That’s the max11 rounds');
    expect(container.querySelector('[data-open-round-banner]')).toHaveClass('bg-purple');
    expect(screen.getByText('11 rounds')).toHaveClass('bg-purple');
  });

  it('rolls the banner in only for those who allow motion', () => {
    const { container } = render(
      <OpenRoundResultOverlay result={{ kind: 'round', round: 2, label: 'Round 2 · Rebuttal', opener: null }} />
    );
    const banner = container.querySelector('[data-open-round-banner]');
    expect(banner).toHaveClass('motion-safe:animate-debate-banner');
    expect(banner?.className).not.toMatch(/(^| )animate-/);
  });
});

describe('openRoundWrapNote', () => {
  it('names whoever did not pick', () => {
    expect(openRoundWrapNote(null, { name: 'Bob', pick: null })).toBe('No picks in time');
    expect(openRoundWrapNote(null, { name: 'Bob', pick: 'extend' })).toBe("You didn't pick in time");
    expect(openRoundWrapNote('extend', { name: 'Bob', pick: null })).toBe("Bob didn't pick in time");
  });

  // An End ends the debate whatever the other pick was, so the cards already say why.
  it('says nothing when someone picked End, even beside a missing pick', () => {
    expect(openRoundWrapNote('end', { name: 'Bob', pick: null })).toBeNull();
    expect(openRoundWrapNote(null, { name: 'Bob', pick: 'end' })).toBeNull();
    expect(openRoundWrapNote('end', { name: 'Bob', pick: 'end' })).toBeNull();
  });

  // Published playback has no "you" (GEO-3277): the first side is named like the second.
  it('names the first side when given a name instead of "you"', () => {
    expect(openRoundWrapNote(null, { name: 'Adam', pick: 'extend' }, 'Preston')).toBe("Preston didn't pick in time");
    expect(openRoundWrapNote('extend', { name: 'Adam', pick: null }, 'Preston')).toBe("Adam didn't pick in time");
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
    expect(current.result).toEqual({ kind: 'round', round: 2, label: 'Round 2 · Rebuttal', opener: null });
    expect(current.localPick).toBeNull();
    expect(current.chipsHidden).toBe(true);
    expect(current.announcedRoundPhase).toMatchObject({ phase: 'speaking', roundIndex: 1 });
  });

  it('names the opener to the other debater, and keeps it up through the count-in', () => {
    const current = reveal({ elapsedMs: 4_000, localSlot: 2, remote: { slot: 1, name: 'Alice' } });
    expect(current.step).toBe('countIn');
    expect(current.result).toEqual({ kind: 'round', round: 2, label: 'Round 2 · Rebuttal', opener: 'Alice' });
  });

  it("keeps the opener's announcement up while a stale payload has not brought the new round yet", () => {
    // Resolved Extend, but this payload predates the next round's turns: the room holds on the result.
    const stale = { ...revealRebut(), turn_durations_ms: [60_000, 60_000] };
    const current = reveal({ debate: stale, elapsedMs: 4_000, remainingSeconds: 0 });
    expect(current.result).toEqual({ kind: 'round', round: 2, label: 'Round 2 · Rebuttal', opener: null });
    expect(current.chipsHidden).toBe(true);
    expect(current.holdsCountIn).toBe(true);
  });

  // Extend beside a missing pick extends: the missing card says no pick, and the new round is announced.
  it('announces the new round when one Extend meets a missing pick', () => {
    const base = revealRebut();
    const picks = [
      { participant_slot: 1 as const, pick: 'extend' as const },
      { participant_slot: 2 as const, pick: null },
    ];
    const debate = {
      ...base,
      open_rounds: {
        ...base.open_rounds!,
        resolution: 'deadline' as const,
        revealed_picks: picks,
        rounds: base.open_rounds!.rounds.map(round => ({ ...round, resolution: 'deadline' as const, picks })),
      },
    };
    expect(reveal({ debate, elapsedMs: 500 }).remotePick).toEqual({ participant_slot: 2, pick: null });
    const announced = reveal({ debate, elapsedMs: 2_000 });
    expect(announced.result).toEqual({ kind: 'round', round: 2, label: 'Round 2 · Rebuttal', opener: null });
    expect(announced.announcement).toBe('You: Extend. Bob: no pick. Round 2. You open.');
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

  describe('the lead-in to a required round (GEO-3258)', () => {
    const leadIn = {
      phase: 'result' as const,
      roundIndex: 0,
      isFinalRound: false as const,
      outcome: 'extend' as const,
      resolvedAtMs: 0,
      nextPhaseStartsAtMs: 8_000,
      leadIn: true as const,
    };
    const debate = requiredRoundListening({ required_round_lead_in_ms: 8_000, extend_count_in_ms: 5_000 });

    it('announces Round 2 at once, with no picks to turn', () => {
      const current = reveal({ debate, phase: leadIn, elapsedMs: 0 });
      expect(current.step).toBe('result');
      expect(current.result).toEqual({ kind: 'round', round: 2, label: 'Round 2 · Rebuttal', opener: null });
      expect(current.localPick).toBeNull();
      expect(current.remotePick).toBeNull();
      expect(current.announcement).toBe('Round 2. You open.');
      expect(current.announcedRoundPhase).toMatchObject({ phase: 'speaking', roundIndex: 1 });
    });

    it('counts the opener in for the end of the pause, while the other debater keeps the announcement', () => {
      expect(reveal({ debate, phase: leadIn, elapsedMs: 3_000 })).toMatchObject({ step: 'countIn', result: null });
      expect(
        reveal({ debate, phase: leadIn, elapsedMs: 3_000, localSlot: 2, remote: { slot: 1, name: 'Alice' } }).result
      ).toEqual({ kind: 'round', round: 2, label: 'Round 2 · Rebuttal', opener: 'Alice' });
    });
  });
});
