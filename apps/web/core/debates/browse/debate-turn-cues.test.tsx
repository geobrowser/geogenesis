import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { TALLY_BURST_MS } from '~/core/debates/claim-ticker';

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

  it('counts the up-next chip down', () => {
    render(<DebateTurnCueOverlay cue={{ kind: 'up-next', slot: 2, opacity: 1, seconds: 7 }} />);
    expect(screen.getByText('Up next in 7s')).toBeInTheDocument();
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
    render(<DebateClaimTally tally={{ count: 1, ageMs: 400 }} />);
    expect(screen.getByText('1 claim')).toBeInTheDocument();
  });

  it('counts up with the debater', () => {
    render(<DebateClaimTally tally={{ count: 7, ageMs: 400 }} />);
    expect(screen.getByText('7 claims')).toBeInTheDocument();
  });

  it('flies the +1 up and away before the number goes', () => {
    const { container } = render(<DebateClaimTally tally={{ count: 3, ageMs: 400 }} />);
    const burst = screen.getByText('+1');
    expect(burst.style.transform).toMatch(/translateY\(-/);
    expect(container.querySelector('[data-claim-tally="3"]')).not.toBeNull();
  });

  it('has already dropped the +1 while the number is still readable', () => {
    render(<DebateClaimTally tally={{ count: 3, ageMs: TALLY_BURST_MS + 100 }} />);
    expect(screen.getByText('+1').style.opacity).toBe('0');
    expect(Number(screen.getByText('3 claims').style.opacity)).toBeGreaterThan(0);
  });
});
