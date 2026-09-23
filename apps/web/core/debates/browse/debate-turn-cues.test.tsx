import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateRoundBadge, DebateScorecard, DebateTurnCueOverlay } from './debate-turn-cues';

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

describe('DebateRoundBadge', () => {
  it('draws nothing before the card announcing the round has handed over', () => {
    const { container } = render(<DebateRoundBadge badge={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('parks the round beside the timer', () => {
    const { container } = render(<DebateRoundBadge badge={{ label: 'Round 2 · Rebuttal', opacity: 1 }} />);
    expect(screen.getByText('Round 2 · Rebuttal')).toBeInTheDocument();
    // Persistent state sits on a surface; only the transient phrases are outlined over the picture.
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.style.textShadow).toBe('');
    expect([...badge.classList]).toContain('pointer-events-none');
  });

  it('ramps in at the strength the handover gave it', () => {
    const { container } = render(<DebateRoundBadge badge={{ label: 'Round 1 · Opening', opacity: 0.5 }} />);
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe('0.5');
  });
});

describe('DebateScorecard', () => {
  const card = (props: Partial<React.ComponentProps<typeof DebateScorecard>> = {}) =>
    render(
      <DebateScorecard
        name="Maya"
        avatar={<img alt="" data-testid="avatar" />}
        claims={9}
        speakingTime="4:07"
        won
        onOpenProfile={vi.fn()}
        {...props}
      />
    );

  it('closes the video on the figures rather than a stop', () => {
    card();
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('claims')).toBeInTheDocument();
    expect(screen.getByText('4:07 speaking')).toBeInTheDocument();
  });

  it('opens with the person, not the number', () => {
    card();
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('keeps the name a link to their profile', async () => {
    const onOpenProfile = vi.fn();
    card({ onOpenProfile });
    await userEvent.click(screen.getByRole('button', { name: /Maya/ }));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('leaves the rest of the card out of the way of the pointer', () => {
    // Everything else on the tile is a click target for play/pause, and a full-cover layer that
    // took events would swallow it.
    const { container } = card();
    expect([...(container.firstElementChild as HTMLElement).classList]).toContain('pointer-events-none');
  });

  it('reads correctly for a debater who made one claim', () => {
    card({ claims: 1, speakingTime: null });
    expect(screen.getByText('claim')).toBeInTheDocument();
  });

  it('says nothing about time it does not have', () => {
    card({ speakingTime: null });
    expect(screen.queryByText(/speaking/)).toBeNull();
  });

  it('marks the higher count without calling the debate', () => {
    // The vote decides who won; this only says who said more, which is a different sentence.
    const { container: winner } = card({ won: true });
    const { container: loser } = card({ name: 'Dev', claims: 4, won: false });
    const figure = (root: HTMLElement, who: string) =>
      root.querySelector(`[data-scorecard="${who}"] span.font-bold`) as HTMLElement;
    expect(figure(winner, 'Maya').style.color).not.toBe('');
    expect(figure(loser, 'Dev').style.color).toBe('');
  });
});
