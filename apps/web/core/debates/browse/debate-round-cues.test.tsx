import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateRoundBadge, DebateRoundCard } from './debate-round-cues';

/** What `roundCardAt` hands over: one line for the badge, the same fact in halves for the card. */
const cue = (round: string, role: string | null, opacity = 1) => ({
  label: role ? `${round} · ${role}` : round,
  round,
  role,
  opacity,
});

afterEach(cleanup);

describe('DebateRoundCard', () => {
  it('draws nothing outside the opening seconds of a round', () => {
    const { container } = render(<DebateRoundCard cue={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the round on two lines, the name of it largest', () => {
    // A title card rather than a caption: read from across a room and out of the corner of an eye,
    // where two short lines carry at a size one long line cannot. The name is the informative
    // half — "Rebuttal" says why this stretch is worth watching, the number only says how far in.
    const { container } = render(<DebateRoundCard cue={cue('Round 2', 'Rebuttal')} />);
    const [round, role] = [...container.querySelectorAll('span')] as HTMLElement[];

    expect(round).toHaveTextContent('Round 2');
    expect(role).toHaveTextContent('Rebuttal');
    // Two thirds of the player, sized off the longest name there is. See `NAME_CQW`.
    expect(role.style.fontSize).toBe('18cqw');
    expect(round.style.fontSize).toBe('9cqw');
  });

  it('sets every round name at the same size, whichever name it is', () => {
    // A size fitted to each word would set "Closing" visibly larger than "Rebuttal", and the card
    // would appear to change its voice from round to round.
    const sizeOf = (role: string) =>
      (render(<DebateRoundCard cue={cue('Round 1', role)} />).container.querySelectorAll('span')[1] as HTMLElement)
        .style.fontSize;

    expect(new Set(['Opening', 'Rebuttal', 'Closing'].map(sizeOf)).size).toBe(1);
  });

  it('scales with the player rather than clamping, so the fraction holds at every width', () => {
    // A clamp is what makes a feed card and a fullscreen player show different fractions of their
    // width; a broadcast title is a proportion of the picture at every size.
    const { container } = render(<DebateRoundCard cue={cue('Round 1', 'Opening')} />);
    const outline = (container.querySelector('span') as HTMLElement).style.textShadow;

    expect(
      [...container.querySelectorAll('span')].every(line => (line as HTMLElement).style.fontSize.endsWith('cqw'))
    ).toBe(true);
    // And the outline goes with it, or it is a 2px hairline on 180px type.
    expect(outline).toContain('em');
  });

  it('gives the round the headline to itself where the format names no role', () => {
    // A middle round of a long format is a round and nothing more, and a lone small line over the
    // seam would read as a stray caption instead of a card.
    const { container } = render(<DebateRoundCard cue={cue('Round 3', null)} />);
    const lines = [...container.querySelectorAll('span')] as HTMLElement[];

    expect(lines).toHaveLength(1);
    expect(screen.getByText('Round 3')).toBeInTheDocument();
    expect(lines[0].style.fontSize).toBe('18cqw');
  });

  it('sits on the seam between the tiles, where the subtitle sits', () => {
    // The one band of the player that is never a face — and a round belongs to both debaters, so
    // its name goes between them rather than over whoever is talking.
    const { container } = render(<DebateRoundCard cue={cue('Round 1', 'Opening')} />);
    const classes = [...(container.firstElementChild as HTMLElement).classList];

    expect(classes).toContain('top-1/2');
    expect(classes).toContain('-translate-y-1/2');
  });

  it('is white type in a black outline, because the seam is the darkest strip there is', () => {
    // The top tile's scrim has run all the way to black by the seam. The debaters' own phrase
    // treatment — dark type in a white outline — would leave the outline holding an empty shape.
    const outline = (
      render(<DebateRoundCard cue={cue('Round 1', 'Opening')} />).container.querySelector('span') as HTMLElement
    ).style.textShadow;

    expect(outline).toContain('#000');
    expect(outline).not.toContain('#fff');
  });

  it('draws at the strength the playhead gave it', () => {
    const { container } = render(<DebateRoundCard cue={cue('Round 1', 'Opening', 0.4)} />);
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe('0.4');
  });

  it("stays out of the accessibility tree and out of the pointer's way", () => {
    // The player already names the speaker; the whole tile behind this is a play/pause button.
    const { container } = render(<DebateRoundCard cue={cue('Round 1', 'Opening')} />);
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

  it('parks the round beside the timer, on the one line a 32px pill allows', () => {
    const { container } = render(<DebateRoundBadge cue={cue('Round 2', 'Rebuttal')} />);
    expect(screen.getByText('Round 2 · Rebuttal')).toBeInTheDocument();
    // Left of the timer, which keeps the corner it has always had.
    expect([...(container.firstElementChild as HTMLElement).classList]).toContain('right-13');
  });

  it('sits on a surface rather than being outlined over the picture', () => {
    // The rule the whole layer follows: transient things are outlined type, persistent things sit
    // on a surface — and this one belongs to the timer beside it.
    const { container } = render(<DebateRoundBadge cue={cue('Round 1', 'Opening')} />);
    const badge = container.firstElementChild as HTMLElement;

    expect(badge.style.textShadow).toBe('');
    expect([...badge.classList]).toContain('rounded-full');
  });

  it('ramps in at the strength the handover gave it', () => {
    const { container } = render(<DebateRoundBadge cue={cue('Round 1', 'Opening', 0.5)} />);
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe('0.5');
  });
});
