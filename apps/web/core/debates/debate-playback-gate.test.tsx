import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebatePlaybackGate, useDebatePlaybackAllowed, useIsDebatePlaybackGated } from './debate-playback-gate';

function Probe({ id }: { id: string }) {
  return <span data-testid={id}>{useDebatePlaybackAllowed(id) ? 'allowed' : 'held'}</span>;
}

function GatedProbe() {
  return <span data-testid="gated">{useIsDebatePlaybackGated() ? 'gated' : 'ungated'}</span>;
}

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('DebatePlaybackGate', () => {
  afterEach(cleanup);

  it('lets everything play where no gate is in force', () => {
    // The explore feed and the full-screen feed provide none, and their cards
    // decide for themselves — this must not change them.
    render(
      <>
        <Probe id={A} />
        <Probe id={B} />
      </>
    );

    expect(screen.getByTestId(A)).toHaveTextContent('allowed');
    expect(screen.getByTestId(B)).toHaveTextContent('allowed');
  });

  it('allows exactly one, and holds the rest', () => {
    render(
      <DebatePlaybackGate allowedId={A}>
        <Probe id={A} />
        <Probe id={B} />
      </DebatePlaybackGate>
    );

    expect(screen.getByTestId(A)).toHaveTextContent('allowed');
    expect(screen.getByTestId(B)).toHaveTextContent('held');
  });

  it('holds everything when nothing is named', () => {
    render(
      <DebatePlaybackGate allowedId={null}>
        <Probe id={A} />
      </DebatePlaybackGate>
    );

    expect(screen.getByTestId(A)).toHaveTextContent('held');
  });

  /**
   * A card asks this to decide how much of itself has to be on screen before it plays. Under a
   * gate the answer is "any of it" — the gate has already chosen one card, so the card's own
   * stricter ratio can only keep the chosen one silent.
   */
  it('tells a card whether a gate is arbitrating', () => {
    render(<GatedProbe />);
    expect(screen.getByTestId('gated')).toHaveTextContent('ungated');

    cleanup();

    render(
      <DebatePlaybackGate allowedId={A}>
        <GatedProbe />
      </DebatePlaybackGate>
    );
    expect(screen.getByTestId('gated')).toHaveTextContent('gated');
  });

  it('is gated even while the gallery has chosen nobody', () => {
    // `allowedId={null}` is a gate holding everything, not the absence of one.
    render(
      <DebatePlaybackGate allowedId={null}>
        <GatedProbe />
      </DebatePlaybackGate>
    );

    expect(screen.getByTestId('gated')).toHaveTextContent('gated');
  });

  it('matches ids however they are spelled', () => {
    // Ids reach this from two directions — a relation and a card — and one of
    // them may carry dashes. Comparing them raw would hold the very card the
    // gallery just chose.
    const dashed = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    render(
      <DebatePlaybackGate allowedId={dashed}>
        <Probe id={A} />
      </DebatePlaybackGate>
    );

    expect(screen.getByTestId(A)).toHaveTextContent('allowed');
  });
});
