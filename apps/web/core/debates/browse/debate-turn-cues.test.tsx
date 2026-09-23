import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { RUN_LENGTH, TALLY_BURST_MS } from '~/core/debates/claim-ticker';

import { DebateClaimTally, DebateTurnCueOverlay } from './debate-turn-cues';

afterEach(cleanup);

describe('DebateTurnCueOverlay', () => {
  it('draws nothing when no cue is firing, which is most of a turn', () => {
    const { container } = render(<DebateTurnCueOverlay cue={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("speaks the room's phrases rather than new ones", () => {
    render(<DebateTurnCueOverlay cue={{ kind: 'wrap-up', slot: 1, opacity: 1 }} />);
    expect(screen.getByText('Wrap it up!')).toBeInTheDocument();
  });

  it('draws the numeral a countdown carries', () => {
    render(<DebateTurnCueOverlay cue={{ kind: 'countdown', slot: 1, opacity: 1, seconds: 2 }} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('counts the hand-off down', () => {
    render(<DebateTurnCueOverlay cue={{ kind: 'up-next', slot: 2, opacity: 1, seconds: 7 }} />);
    expect(screen.getByText('Up next in 7s')).toBeInTheDocument();
  });

  it('names the round it is opening', () => {
    render(<DebateTurnCueOverlay cue={{ kind: 'round', slot: 1, opacity: 1, label: 'Round 2 · Rebuttal' }} />);
    expect(screen.getByText('Round 2 · Rebuttal')).toBeInTheDocument();
  });

  it('wears the same treatment for every phrase, so none of them reads as a different thing', () => {
    // The phrases are one family and the numerals another — a chip anywhere in here would read as
    // a notification about the app rather than as part of the debate.
    const phrase = (cue: Parameters<typeof DebateTurnCueOverlay>[0]['cue']) => {
      const { container, unmount } = render(<DebateTurnCueOverlay cue={cue} />);
      const shadow = (container.querySelector('span') as HTMLElement).style.textShadow;
      unmount();
      return shadow;
    };

    const wrapUp = phrase({ kind: 'wrap-up', slot: 1, opacity: 1 });
    expect(phrase({ kind: 'time', slot: 1, opacity: 1 })).toBe(wrapUp);
    expect(phrase({ kind: 'round', slot: 1, opacity: 1, label: 'Round 1 · Opening' })).toBe(wrapUp);
    expect(phrase({ kind: 'up-next', slot: 2, opacity: 1, seconds: 4 })).toBe(wrapUp);
    // The numerals are the inverse — white in a black outline — and must not match.
    expect(phrase({ kind: 'go', slot: 1, opacity: 1 })).not.toBe(wrapUp);
  });

  it('renders the cue at the strength the playhead gave it', () => {
    const { container } = render(<DebateTurnCueOverlay cue={{ kind: 'go', slot: 2, opacity: 0.4 }} />);
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe('0.4');
  });

  it('stays out of the accessibility tree and out of the way of the pointer', () => {
    // The video behind the whole tile is one big play/pause button, and the player already says
    // whose turn it is — so these are decoration on facts stated elsewhere.
    const { container } = render(<DebateTurnCueOverlay cue={{ kind: 'time', slot: 1, opacity: 1 }} />);
    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay).toHaveAttribute('aria-hidden');
    expect([...overlay.classList]).toContain('pointer-events-none');
  });
});

describe('DebateClaimTally', () => {
  it('draws nothing in the silences', () => {
    const { container } = render(<DebateClaimTally tally={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says how many claims that makes, and pluralises the first one', () => {
    render(<DebateClaimTally tally={{ count: 1, ageMs: 400, run: 1 }} />);
    expect(screen.getByText('1 claim')).toBeInTheDocument();
  });

  it('counts up with the debater', () => {
    render(<DebateClaimTally tally={{ count: 7, ageMs: 400, run: 1 }} />);
    expect(screen.getByText('7 claims')).toBeInTheDocument();
  });

  it('flies the +1 up and away before the number goes', () => {
    const { container } = render(<DebateClaimTally tally={{ count: 3, ageMs: 400, run: 1 }} />);
    const burst = screen.getByText('+1');
    expect(burst.style.transform).toMatch(/translateY\(-/);
    expect(container.querySelector('[data-claim-tally="3"]')).not.toBeNull();
  });

  it('has already dropped the +1 while the number is still readable', () => {
    render(<DebateClaimTally tally={{ count: 3, ageMs: TALLY_BURST_MS + 100, run: 1 }} />);
    expect(screen.getByText('+1').style.opacity).toBe('0');
    expect(Number(screen.getByText('3 claims').style.opacity)).toBeGreaterThan(0);
  });

  it('calls out a run instead of the total, which is the only thing here that celebrates', () => {
    const { container } = render(<DebateClaimTally tally={{ count: 9, ageMs: 300, run: RUN_LENGTH }} />);
    expect(screen.getByText(`${RUN_LENGTH} in a row`)).toBeInTheDocument();
    expect(container.querySelector(`[data-claim-run="${RUN_LENGTH}"]`)).not.toBeNull();
  });

  it('goes back to reporting once the run is over', () => {
    const { container } = render(<DebateClaimTally tally={{ count: 9, ageMs: 300, run: RUN_LENGTH - 1 }} />);
    expect(screen.getByText('9 claims')).toBeInTheDocument();
    expect(container.querySelector('[data-claim-run]')).toBeNull();
  });

  it('holds the total up at the end, where there is no claim left to cover', () => {
    render(<DebateClaimTally final tally={{ count: 9, ageMs: 60_000, run: 1 }} />);
    // Past every window, and still there — the video has to end on something.
    expect(screen.getByText('9 claims').style.opacity).toBe('1');
    expect(screen.getByText('+1').style.opacity).toBe('0');
  });
});
