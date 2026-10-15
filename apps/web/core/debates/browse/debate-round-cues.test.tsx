import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateRoundBadge, DebateRoundBanner } from './debate-round-cues';

/** What `roundCardAt` hands over: one line for the badge, the same fact in halves for the card. */
const cue = (round: string, role: string | null, opacity = 1, ageMs?: number) => ({
  label: role ? `${round} · ${role}` : round,
  round,
  role,
  opacity,
  ...(ageMs !== undefined && { ageMs }),
});

afterEach(cleanup);

describe('DebateRoundBanner', () => {
  it('draws nothing outside the opening seconds of a round', () => {
    const { container } = render(<DebateRoundBanner cue={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces every role a format has, the closing included (GEO-3353)', () => {
    for (const role of ['Opening', 'Rebuttal', 'Closing']) {
      render(<DebateRoundBanner cue={cue('Round 1', role)} />);
      expect(screen.getByText(`Round 1 · ${role}`)).toBeInTheDocument();
      cleanup();
    }
  });

  it('says the round alone where the format names no role', () => {
    render(<DebateRoundBanner cue={cue('Round 3', null)} />);
    expect(screen.getByText('Round 3')).toBeInTheDocument();
  });

  it('is the breaks’ purple band at the stamps design’s size, across the seam', () => {
    // The one band of the player that is never a face — and a round belongs to both debaters, so
    // its name goes between them rather than over whoever is talking.
    const { container } = render(<DebateRoundBanner cue={cue('Round 2', 'Rebuttal')} />);
    const seam = container.firstElementChild as HTMLElement;
    const band = seam.firstElementChild as HTMLElement;

    expect([...seam.classList]).toEqual(expect.arrayContaining(['inset-x-0', 'top-1/2', '-translate-y-1/2']));
    expect([...band.classList]).toEqual(expect.arrayContaining(['bg-purple', 'text-[5cqw]', 'uppercase']));
  });

  it('picks its roll up from where the playhead stood when it went up', () => {
    // A scrub into the middle of a round's opening seconds lands part way through the roll rather
    // than starting it again.
    const { container } = render(<DebateRoundBanner cue={cue('Round 2', 'Rebuttal', 1, 600)} />);
    const band = (container.firstElementChild as HTMLElement).firstElementChild as HTMLElement;

    expect(band.style.animationDelay).toBe('-600ms');
  });

  it("stays out of the accessibility tree and out of the pointer's way", () => {
    // The round tag says the same thing to a screen reader; the whole tile behind is play/pause.
    const { container } = render(<DebateRoundBanner cue={cue('Round 1', 'Opening')} />);
    const banner = container.firstElementChild as HTMLElement;

    expect(banner).toHaveAttribute('aria-hidden');
    expect([...banner.classList]).toContain('pointer-events-none');
  });
});

describe('DebateRoundBadge', () => {
  it('draws nothing until the card has handed over', () => {
    const { container } = render(<DebateRoundBadge cue={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('parks the round beside the timer, on the one line a 32px circle allows', () => {
    const { container } = render(<DebateRoundBadge cue={cue('Round 2', 'Rebuttal')} />);
    expect(screen.getByText('Round 2 · Rebuttal')).toBeInTheDocument();
    // Left of the timer, which keeps the corner it has always had.
    expect([...(container.firstElementChild as HTMLElement).classList]).toContain('right-13');
  });

  it('is the stamps design’s purple tag in every format (GEO-3353)', () => {
    render(<DebateRoundBadge cue={cue('Round 3', 'Closing')} />);
    const tag = screen.getByText('Round 3 · Closing');

    expect(tag).toHaveAttribute('data-round-tag');
    expect([...tag.classList]).toEqual(expect.arrayContaining(['bg-purple', 'text-[2.8cqw]', 'uppercase']));
  });

  it('moves left to make room for a growing timer', () => {
    const { container } = render(<DebateRoundBadge cue={cue('Round 1', 'Opening')} rightPx={61.6} />);
    expect((container.firstElementChild as HTMLElement).style.right).toBe('61.6px');
  });

  it('names the round to a screen reader in words rather than typography', () => {
    render(<DebateRoundBadge cue={cue('Round 2', 'Rebuttal')} />);
    expect(screen.getByText('Round 2, Rebuttal')).toHaveClass('sr-only');
  });

  it('ramps in at the strength the handover gave it', () => {
    const { container } = render(<DebateRoundBadge cue={cue('Round 1', 'Opening', 0.5)} />);
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe('0.5');
  });
});
