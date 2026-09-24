import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateEndCard, type DebateEndCardSide } from './debate-end-card';

afterEach(cleanup);

const side = (overrides: Partial<DebateEndCardSide> = {}): DebateEndCardSide => ({
  name: 'Maya',
  avatar: <img alt="" data-testid={`avatar-${overrides.name ?? 'Maya'}`} />,
  claims: 9,
  speakingTime: '4:07',
  agreement: { percent: 68, positive: 34, total: 50, word: 'agreed', confident: true },
  onOpenProfile: vi.fn(),
  ...overrides,
});

function card(overrides: { sides?: DebateEndCardSide[]; claim?: string } = {}) {
  return render(
    <DebateEndCard
      claim={overrides.claim ?? 'Nuclear is the cheapest firm low-carbon power'}
      prompt="Where do you stand?"
      responseControl={<button type="button">Agree</button>}
      sides={overrides.sides ?? [side(), side({ name: 'Dev', claims: 7 })]}
      replay={<button type="button">Replay debate</button>}
    />
  );
}

describe('DebateEndCard', () => {
  it('leads with the question and the motion it is about', () => {
    const { container } = card();
    const text = container.textContent ?? '';

    // The question has to reach the reader before the figures, or it is a footnote to them — and
    // it has to name the motion, or it is a question about nothing.
    expect(text.indexOf('Where do you stand?')).toBeLessThan(text.indexOf('claims'));
    expect(text.indexOf('Nuclear is the cheapest')).toBeLessThan(text.indexOf('claims'));
  });

  it('answers on the claim itself rather than offering its own control', () => {
    card();
    expect(screen.getByRole('button', { name: 'Agree' })).toBeInTheDocument();
  });

  it('puts the two debaters side by side, which is the comparison it exists to make', () => {
    const { container } = card();
    const cards = [...container.querySelectorAll('[data-scorecard]')];

    expect(cards.map(node => node.getAttribute('data-scorecard'))).toEqual(['Maya', 'Dev']);
    // One grid row: stacking them turns a comparison into two readouts near each other.
    expect([...(cards[0].parentElement as HTMLElement).classList]).toContain('grid-cols-2');
  });

  it('reports the share once enough people have answered to characterise it', () => {
    card({ sides: [side()] });
    expect(screen.getByText('68% agreed')).toBeInTheDocument();
  });

  it('gives the raw counts rather than a share when too few have', () => {
    // "67% agreed" off three responses is a figure pretending to be a population; "2 of 3" says
    // exactly what it knows. Showing nothing at all — which is what this used to do — made the
    // card look broken on every debate whose claims were only days old.
    card({ sides: [side({ agreement: { percent: 67, positive: 2, total: 3, word: 'agreed', confident: false } })] });

    expect(screen.getByText('2 of 3 agreed')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('says so plainly when nobody has answered', () => {
    card({ sides: [side({ agreement: null })] });
    expect(screen.getByText('No responses yet')).toBeInTheDocument();
  });

  it('draws the bar at any confidence, so the row never has a hole in it', () => {
    const { container } = card({
      sides: [side({ agreement: { percent: 40, positive: 2, total: 5, word: 'verified', confident: false } })],
    });

    expect(container.querySelector('[style*="width: 40%"]')).not.toBeNull();
    expect(screen.getByText('2 of 5 verified')).toBeInTheDocument();
  });

  it('keeps each name a link to their profile', async () => {
    const onOpenProfile = vi.fn();
    card({ sides: [side({ onOpenProfile })] });

    await userEvent.click(screen.getByRole('button', { name: /Maya/ }));

    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('holds its own way back, under the figures', () => {
    const { container } = card();
    const replay = screen.getByRole('button', { name: 'Replay debate' });
    const text = container.textContent ?? '';

    expect(replay).toBeInTheDocument();
    expect(text.indexOf('claims')).toBeLessThan(text.indexOf('Replay'));
  });

  it('takes no clicks of its own, because the video behind it is a play button', () => {
    const { container } = card();
    expect([...(container.firstElementChild as HTMLElement).classList]).toContain('pointer-events-none');
  });
});
