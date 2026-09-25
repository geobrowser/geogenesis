import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateRoundBadge, DebateRoundCard } from './debate-round-cues';

afterEach(cleanup);

describe('DebateRoundCard', () => {
  it('draws nothing outside the opening seconds of a round', () => {
    const { container } = render(<DebateRoundCard cue={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the round', () => {
    render(<DebateRoundCard cue={{ label: 'Round 2 · Rebuttal', opacity: 1 }} />);
    expect(screen.getByText('Round 2 · Rebuttal')).toBeInTheDocument();
  });

  it('sits on the seam between the tiles, where the subtitle sits', () => {
    // The one band of the player that is never a face — and a round belongs to both debaters, so
    // its name goes between them rather than over whoever is talking.
    const { container } = render(<DebateRoundCard cue={{ label: 'Round 1 · Opening', opacity: 1 }} />);
    const classes = [...(container.firstElementChild as HTMLElement).classList];

    expect(classes).toContain('top-1/2');
    expect(classes).toContain('-translate-y-1/2');
  });

  it('is white type in a black outline, because the seam is the darkest strip there is', () => {
    // The top tile's scrim has run all the way to black by the seam. The debaters' own phrase
    // treatment — dark type in a white outline — would leave the outline holding an empty shape.
    const outline = (
      render(<DebateRoundCard cue={{ label: 'Round 1 · Opening', opacity: 1 }} />).container.querySelector(
        'span'
      ) as HTMLElement
    ).style.textShadow;

    expect(outline).toContain('#000');
    expect(outline).not.toContain('#fff');
  });

  it('draws at the strength the playhead gave it', () => {
    const { container } = render(<DebateRoundCard cue={{ label: 'Round 1 · Opening', opacity: 0.4 }} />);
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe('0.4');
  });

  it("stays out of the accessibility tree and out of the pointer's way", () => {
    // The player already names the speaker; the whole tile behind this is a play/pause button.
    const { container } = render(<DebateRoundCard cue={{ label: 'Round 1 · Opening', opacity: 1 }} />);
    const card = container.firstElementChild as HTMLElement;

    expect(card).toHaveAttribute('aria-hidden');
    expect([...card.classList]).toContain('pointer-events-none');
  });
});

describe('DebateRoundBadge', () => {
  it('draws nothing until the card has handed over', () => {
    const { container } = render(<DebateRoundBadge cue={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('parks the round beside the timer', () => {
    const { container } = render(<DebateRoundBadge cue={{ label: 'Round 2 · Rebuttal', opacity: 1 }} />);
    expect(screen.getByText('Round 2 · Rebuttal')).toBeInTheDocument();
    // Left of the timer, which keeps the corner it has always had.
    expect([...(container.firstElementChild as HTMLElement).classList]).toContain('right-13');
  });

  it('sits on a surface rather than being outlined over the picture', () => {
    // The rule the whole layer follows: transient things are outlined type, persistent things sit
    // on a surface — and this one belongs to the timer beside it.
    const { container } = render(<DebateRoundBadge cue={{ label: 'Round 1 · Opening', opacity: 1 }} />);
    const badge = container.firstElementChild as HTMLElement;

    expect(badge.style.textShadow).toBe('');
    expect([...badge.classList]).toContain('rounded-full');
  });

  it('ramps in at the strength the handover gave it', () => {
    const { container } = render(<DebateRoundBadge cue={{ label: 'Round 1 · Opening', opacity: 0.5 }} />);
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe('0.5');
  });
});
