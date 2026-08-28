import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { HubPillButton } from './hub-pill-button';

afterEach(cleanup);

describe('HubPillButton', () => {
  /**
   * The pill is a fixed `h-7`. In a flex row — the People tab pairs one with a person's name —
   * a label long enough to be squeezed wraps to a second line and spills out of that height.
   * nowrap is what prevents it: min-content becomes max-content, so a flex item's default
   * `min-width: auto` stops the row squeezing the pill, and the name truncates instead.
   */
  it('holds its width and keeps its label on one line', () => {
    render(<HubPillButton>Request debate</HubPillButton>);

    expect(screen.getByRole('button')).toHaveClass('shrink-0', 'whitespace-nowrap', 'h-7');
  });

  it('swaps in the pending label and stops taking clicks while pending', () => {
    render(
      <HubPillButton pending pendingLabel="Requesting…">
        Request debate
      </HubPillButton>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Requesting…');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
