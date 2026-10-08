import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateInteractionBar } from './debate-interaction-bar';

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="vote-buttons" />,
}));

afterEach(cleanup);

function renderBar(props: Partial<React.ComponentProps<typeof DebateInteractionBar>> = {}) {
  return render(
    <DebateInteractionBar
      orientation="horizontal"
      entityId="debate-1"
      spaceId="space-1"
      commentCount={3}
      onComment={() => {}}
      {...props}
    />
  );
}

const roundsIndicator = () => document.querySelector('[data-debate-rounds]');
const pips = () => roundsIndicator()?.querySelectorAll('[data-round-pip]').length ?? 0;

// GEO-3180. A debate both sides kept extending says so beside its actions.
describe('DebateInteractionBar rounds', () => {
  it('shows how many rebuttal rounds a debate went, one pip each', () => {
    renderBar({ rebuttalRounds: 3 });

    expect(roundsIndicator()).toHaveTextContent('3 rounds');
    expect(screen.getByText('3 rebuttal rounds')).toHaveClass('sr-only');
    expect(pips()).toBe(3);
  });

  it('is not one of the actions', () => {
    renderBar({ rebuttalRounds: 1 });

    expect(roundsIndicator()).toHaveTextContent('1 round');
    expect(screen.getByText('1 rebuttal round')).toBeInTheDocument();
    expect(roundsIndicator()?.closest('button')).toBeNull();
  });

  it('shows nothing for a debate that ended after the opening', () => {
    renderBar({ rebuttalRounds: 0 });

    expect(roundsIndicator()).toBeNull();
  });

  it('shows nothing for a fixed format', () => {
    renderBar({ rebuttalRounds: null });

    expect(roundsIndicator()).toBeNull();
  });

  it('carries the count on the full-screen rail too', () => {
    renderBar({ orientation: 'vertical', rebuttalRounds: 4 });

    expect(roundsIndicator()).toHaveTextContent('4Rounds');
    expect(screen.getByText('4 rebuttal rounds')).toBeInTheDocument();
  });

  it('drops the pips on a compact card but keeps the count', () => {
    renderBar({ compact: true, rebuttalRounds: 2 });

    expect(roundsIndicator()).toHaveTextContent('2 rounds');
    expect(pips()).toBe(0);
  });
});
